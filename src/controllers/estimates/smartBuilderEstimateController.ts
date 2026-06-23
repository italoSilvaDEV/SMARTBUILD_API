import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";

type EstimateAiRole = "user" | "assistant" | "system";

type SmartBuilderService = {
  id?: string | null;
  name: string;
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  lineTotal?: number | null;
  price?: number | null;
  hours?: number | null;
  id_service?: string | null;
  serviceCatalogId?: string | null;
  notes?: string | null;
};

type SmartBuilderMessage = {
  id?: string;
  role: EstimateAiRole;
  content: string;
  payload?: any;
  responseId?: string | null;
  date_creation?: string;
  attachments?: SmartBuilderAttachment[];
};

type SmartBuilderAttachment = {
  id?: string;
  fileName: string;
  originalName: string;
  mimeType?: string | null;
  size?: number | null;
  s3Key?: string | null;
  extractedText?: string | null;
  summary?: string | null;
};

type DraftSessionPayload = {
  messages?: SmartBuilderMessage[];
  attachments?: SmartBuilderAttachment[];
  metadata?: any;
};

type SmartBuilderGrounding = {
  importPricingIntent: boolean;
  companyId: string | null;
  shouldUseCatalog: boolean;
  serviceCatalog: any[];
  catalogCandidates: ReturnType<typeof compactServiceCatalogForPrompt>;
  catalogStats: {
    categoriesTotal: number;
    categoriesActive: number;
    subcategoriesTotal: number;
    subcategoriesActive: number;
    servicesTotal: number;
    servicesActive: number;
  } | null;
  allowWebSearch: boolean;
  webResearch: {
    used: boolean;
    skippedReason?: string;
    summary?: string;
    responseId?: string | null;
    durationMs?: number;
    error?: ReturnType<typeof summarizeSmartBuilderError>;
  };
};

const openai = (process.env.OPENAI_KEY || process.env.OPENAI_API_KEY)
  ? new OpenAI({
    apiKey: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY,
    maxRetries: 0,
  })
  : null;

const SERVICE_MODEL = process.env.SMARTBUILDER_SERVICE_MODEL || "gpt-5.5";
const DOC_MODEL = process.env.SMARTBUILDER_DOC_MODEL || "gpt-5.5";
const WEB_SEARCH_ENABLED = String(process.env.SMARTBUILDER_WEB_SEARCH_ENABLED || "true").toLowerCase() === "true";
const WEB_SEARCH_TOOL_TYPE = process.env.SMARTBUILDER_WEB_SEARCH_TOOL_TYPE || "web_search";
const WEB_SEARCH_TIMEOUT_MS = Number(process.env.SMARTBUILDER_WEB_SEARCH_TIMEOUT_MS || 10_000);
const OPENAI_REQUEST_TIMEOUT_MS = Number(process.env.SMARTBUILDER_OPENAI_TIMEOUT_MS || 60_000);
const OPENAI_RETRY_TIMEOUT_MS = Number(process.env.SMARTBUILDER_OPENAI_RETRY_TIMEOUT_MS || 45_000);
const OPENAI_MAX_OUTPUT_TOKENS = Number(process.env.SMARTBUILDER_MAX_OUTPUT_TOKENS || 4200);
const OPENAI_WEB_RESEARCH_MAX_OUTPUT_TOKENS = Number(process.env.SMARTBUILDER_WEB_RESEARCH_MAX_OUTPUT_TOKENS || 700);
const OPENAI_DOC_CONTEXT_MAX_OUTPUT_TOKENS = Number(process.env.SMARTBUILDER_DOC_CONTEXT_MAX_OUTPUT_TOKENS || 2500);
const OPENAI_MAX_SERVICE_TOOL_CALLS = Number(process.env.SMARTBUILDER_MAX_SERVICE_TOOL_CALLS || 2);
const OPENAI_MAX_TRANSIENT_RETRIES = Number(process.env.SMARTBUILDER_OPENAI_MAX_TRANSIENT_RETRIES || 0);
const OPENAI_TRANSIENT_RETRY_DELAY_MS = Number(process.env.SMARTBUILDER_OPENAI_TRANSIENT_RETRY_DELAY_MS || 1_500);
const SMARTBUILDER_TRACE_LOGS = String(process.env.SMARTBUILDER_TRACE_LOGS || "true").toLowerCase() !== "false";
const CATALOG_GROUNDING_ENABLED = String(process.env.SMARTBUILDER_CATALOG_GROUNDING_ENABLED || "false").toLowerCase() === "true";
const CATALOG_TOOL_ENABLED = String(process.env.SMARTBUILDER_CATALOG_TOOL_ENABLED || "true").toLowerCase() === "true";
const CATALOG_INCLUDE_INACTIVE_FALLBACK = String(process.env.SMARTBUILDER_CATALOG_INCLUDE_INACTIVE_FALLBACK || "false").toLowerCase() === "true";
const SERVICE_REASONING_EFFORT = process.env.SMARTBUILDER_REASONING_EFFORT || process.env.SMARTBUILDER_SERVICE_REASONING_EFFORT || "low";
const DOC_REASONING_EFFORT = process.env.SMARTBUILDER_DOC_REASONING_EFFORT || "medium";
const TEXT_VERBOSITY = process.env.SMARTBUILDER_TEXT_VERBOSITY || "medium";
const HISTORY_LIMIT = 30;
const MAX_TEXT_ATTACHMENT_CHARS = 16_000;
const MAX_CATALOG_SERVICES = 250;
const MAX_PROMPT_CATALOG_SERVICES = Number(process.env.SMARTBUILDER_MAX_PROMPT_CATALOG_SERVICES || 20);

function buildSmartBuilderContractPrompt() {
  return [
    "You are SmartBuilder AI for Pro SmartBuild estimates. V1 scope: estimate Line Items/services only.",
    "Return a complete proposedServices list for user review; never apply changes directly.",
    "Preserve existing service ids when modifying existing services. Use null id for new services.",
    "",
    "SmartBuilder Contract, in priority order:",
    "1. The user's latest instruction is the highest priority. If it asks for a target total, cap, exact item price, description change, or exception, obey it unless impossible.",
    "2. In edit flows, currentServices are the current truth. Do not remove, rename, reprice, or reorder existing services unless the latest instruction asks for it.",
    "3. Use conversation history only as context; never let old messages override the latest instruction or currentServices.",
    "4. Attached documents are strong context. When the user asks to copy/import/replicate/use a document, use the document as the baseline for structure, scope, names, quantities, and explicit prices, while still applying any latest requested changes.",
    "5. Project, client, location, and company context help fill gaps; they do not override explicit user instructions.",
    "6. Use construction knowledge and web_search_market_rates only as support for new/scratch pricing or missing prices. Do not use web search to override explicit document prices.",
    "",
    "Copy/import behavior:",
    "- Infer the source document's commercial structure naturally: priced rows, units, rooms, phases, sections, allowances, alternates, or summary totals.",
    "- Preserve the document's own grouping unless the latest user request asks to reorganize or adjust it.",
    "- If the document has explicit prices and the user asks to copy/import, copy those prices exactly unless the user asks for a target total or price changes.",
    "- If the document lacks prices, copy the structure/scope faithfully and estimate only the money fields. Add one concise warning that pricing was estimated because the document did not include explicit pricing.",
    "- Do not add unrelated scope, generic assumptions/exclusions, code/licensing claims, hidden-damage language, or quality claims unless present in the document or requested by the user.",
    "",
    "Pricing behavior:",
    "- Price for realistic average/mid-market United States construction work: not lowball, not premium padded.",
    "- Include normal labor, materials, prep/protection, disposal, mobilization, overhead, and reasonable contractor margin.",
    "- If the user gives an exact total, match it within $1 when possible.",
    "- If the user says around/about/approximately, stay within 2% when possible.",
    "- If the user says not to exceed, do not exceed the target.",
    "- If you cannot meet a target without violating explicit scope/prices, keep the best compliant proposal and explain the variance in instructionComplianceNotes and warnings.",
    "- Do not aggressively round prices. Use normal currency precision and realistic calculated values; avoid making every item end in 00, 50, 500, or 000.",
    "",
    "Writing standards:",
    "- All service names, descriptions, notes, assistant messages, and warnings must be professional American English.",
    "- Descriptions must be client-ready, specific, and construction-useful. Use safe simple HTML only.",
    "- For generated/scratch services, include focused sections when useful, such as Scope of Work, Preparation, Materials, Execution, Finish/Cleanup, Quality Standards, Assumptions, and Exclusions.",
    "- For copy/import services, format copied scope cleanly but do not expand beyond the source document unless the user asks.",
    "",
    "Tool discipline:",
    "- Use at most one web_search_market_rates call, only when current US market pricing context materially helps.",
    "- After tool results, return the required JSON. Do not call tools again.",
    "- Do not change taxes, discounts, project status, signatures, invoices, clients, payments, schedules, or PDFs.",
  ].join("\n");
}

const SMARTBUILDER_SYSTEM_PROMPT = buildSmartBuilderContractPrompt();

const smartBuilderJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assistantMessage: { type: "string" },
    proposedServices: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: ["string", "null"] },
          name: { type: "string" },
          description: { type: ["string", "null"] },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
          lineTotal: { type: "number" },
          serviceCatalogId: { type: ["string", "null"] },
          notes: { type: ["string", "null"] },
        },
        required: ["id", "name", "description", "quantity", "unitPrice", "lineTotal", "serviceCatalogId", "notes"],
      },
    },
    changeSummary: {
      type: "array",
      items: { type: "string" },
    },
    warnings: {
      type: "array",
      items: { type: "string" },
    },
    pricingIntent: {
      type: ["string", "null"],
      enum: ["standard", "copy_exact", "copy_with_changes", "exact_total", "approximate_total", "not_exceed", null],
    },
    targetTotal: { type: ["number", "null"] },
    proposedTotal: { type: ["number", "null"] },
    targetVariance: { type: ["number", "null"] },
    documentPricingDetected: { type: ["boolean", "null"] },
    instructionComplianceNotes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "assistantMessage",
    "proposedServices",
    "changeSummary",
    "warnings",
    "pricingIntent",
    "targetTotal",
    "proposedTotal",
    "targetVariance",
    "documentPricingDetected",
    "instructionComplianceNotes",
  ],
};

function supportsReasoningControls(model: string) {
  const normalizedModel = String(model || "").toLowerCase();
  return normalizedModel.startsWith("gpt-5") || normalizedModel.startsWith("o");
}

function buildReasoningOptions(model: string, effort: string, enabled = false) {
  return enabled && supportsReasoningControls(model)
    ? { reasoning: { effort } }
    : {};
}

function buildTextOptions(model: string, format: any, enableVerbosity = false) {
  return {
    text: {
      ...(enableVerbosity && supportsReasoningControls(model) ? { verbosity: TEXT_VERBOSITY } : {}),
      format,
    },
  };
}

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function safeParseAiJson(value: string) {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return {};
  }
}

function getResponseText(response: any) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const messageItem = output.find((item: any) => item?.type === "message");
  const content = Array.isArray(messageItem?.content) ? messageItem.content : [];
  const outputText = content.find((item: any) => item?.type === "output_text" || item?.type === "text");

  return typeof outputText?.text === "string" ? outputText.text.trim() : "";
}

function decimalToNumber(value: any, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function moneyToNumber(value: any, fallback = 0) {
  return roundCurrency(decimalToNumber(value, fallback));
}

function sumServicesTotal(services: SmartBuilderService[]) {
  return roundCurrency((Array.isArray(services) ? services : []).reduce((total, service) => {
    const quantity = decimalToNumber(service.quantity ?? service.hours, 1) || 1;
    const unitPrice = moneyToNumber(service.unitPrice ?? service.price, 0);
    const lineTotal = moneyToNumber(service.lineTotal, roundCurrency(quantity * unitPrice));
    return total + lineTotal;
  }, 0));
}

function parseMoneyAmount(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  const multiplier = /\bk\b/.test(normalized) ? 1_000 : /\b(m|million)\b/.test(normalized) ? 1_000_000 : 1;
  const cleaned = normalized
    .replace(/[$,\s]/g, "")
    .replace(/\b(k|m|million|dollars?|usd)\b/g, "")
    .replace(/[^\d.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? roundCurrency(parsed * multiplier) : null;
}

function extractTargetPricingInstruction(message: string) {
  const normalized = String(message || "").toLowerCase();
  const moneyMatches = Array.from(normalized.matchAll(/(?:\$|usd\s*)?\d[\d,]*(?:\.\d{1,2})?\s*(?:k|m|million|dollars?|usd)?/gi))
    .map((match) => {
      const raw = match[0];
      const index = typeof match.index === "number" ? match.index : 0;
      const context = normalized.slice(Math.max(0, index - 45), index + raw.length + 45);
      const hasCurrencySignal = /[$]|\busd\b|\bdollars?\b|\bk\b|\bm\b|\bmillion\b/i.test(raw);
      const hasTargetContext = /\b(total|budget|amount|target|not exceed|maximum|max|around|about|approximately|roughly|cost|price|valor|or[cç]amento|pre[cç]o)\b/i.test(context);
      const parsed = parseMoneyAmount(raw);

      if (parsed === null) return null;
      if (!hasCurrencySignal && !hasTargetContext) return null;
      if (!hasCurrencySignal && parsed >= 1900 && parsed <= 2099 && /\b(19|20)\d{2}\b/.test(raw)) return null;

      return parsed;
    })
    .filter((value): value is number => typeof value === "number" && value > 0);
  const targetTotal = moneyMatches.length ? moneyMatches[moneyMatches.length - 1] : null;

  if (!targetTotal) {
    return {
      pricingIntent: "standard",
      targetTotal: null,
      toleranceType: null as "exact" | "approximate" | "not_exceed" | null,
      toleranceAmount: null as number | null,
    };
  }

  const isNotExceed = [
    "not exceed",
    "do not exceed",
    "don't exceed",
    "no more than",
    "maximum",
    "max ",
    "under ",
    "below ",
    "up to",
    "nao passar",
    "não passar",
    "maximo",
    "máximo",
  ].some((term) => normalized.includes(term));

  const isApproximate = [
    "around",
    "about",
    "approximately",
    "approx",
    "roughly",
    "near",
    "close to",
    "cerca",
    "aproximadamente",
    "por volta",
    "perto de",
  ].some((term) => normalized.includes(term));

  if (isNotExceed) {
    return {
      pricingIntent: "not_exceed",
      targetTotal,
      toleranceType: "not_exceed" as const,
      toleranceAmount: 1,
    };
  }

  if (isApproximate) {
    return {
      pricingIntent: "approximate_total",
      targetTotal,
      toleranceType: "approximate" as const,
      toleranceAmount: roundCurrency(targetTotal * 0.02),
    };
  }

  const mentionsTotalOrBudget = [
    "total",
    "budget",
    "amount",
    "price",
    "cost",
    "estimate",
    "valor",
    "orçamento",
    "orcamento",
    "preco",
    "preço",
  ].some((term) => normalized.includes(term));

  return {
    pricingIntent: mentionsTotalOrBudget ? "exact_total" : "standard",
    targetTotal: mentionsTotalOrBudget ? targetTotal : null,
    toleranceType: mentionsTotalOrBudget ? ("exact" as const) : null,
    toleranceAmount: mentionsTotalOrBudget ? 1 : null,
  };
}

function normalizeServices(services: SmartBuilderService[]) {
  return (Array.isArray(services) ? services : []).map((service) => {
    const quantity = decimalToNumber(service.quantity ?? service.hours, 1) || 1;
    const unitPrice = moneyToNumber(service.unitPrice ?? service.price, 0);
    const lineTotal = moneyToNumber(service.lineTotal, roundCurrency(quantity * unitPrice));

    return {
      id: service.id ?? null,
      name: String(service.name || "New Service").trim(),
      description: service.description ?? "",
      quantity,
      unitPrice,
      lineTotal,
      serviceCatalogId: service.serviceCatalogId ?? service.id_service ?? null,
      notes: service.notes ?? null,
    };
  });
}

function normalizeAiResponse(raw: any, fallbackServices: SmartBuilderService[], message = "") {
  const targetInstruction = extractTargetPricingInstruction(message);
  const fallbackProposedServices = normalizeServices(fallbackServices);
  const fallbackProposedTotal = sumServicesTotal(fallbackProposedServices);
  const fallback = {
    assistantMessage: "I prepared a line item proposal for review.",
    proposedServices: fallbackProposedServices,
    changeSummary: [],
    warnings: ["The AI response could not be fully parsed, so the current services were preserved."],
    pricingIntent: targetInstruction.pricingIntent,
    targetTotal: targetInstruction.targetTotal,
    proposedTotal: fallbackProposedTotal,
    targetVariance: targetInstruction.targetTotal !== null ? roundCurrency(fallbackProposedTotal - targetInstruction.targetTotal) : null,
    documentPricingDetected: null as boolean | null,
    instructionComplianceNotes: [] as string[],
  };

  if (!raw || typeof raw !== "object") return fallback;
  const proposedServices = normalizeServices(Array.isArray(raw.proposedServices) ? raw.proposedServices : fallbackServices);
  const proposedTotal = sumServicesTotal(proposedServices);
  const targetTotal = typeof raw.targetTotal === "number"
    ? roundCurrency(raw.targetTotal)
    : targetInstruction.targetTotal;
  const pricingIntent = typeof raw.pricingIntent === "string" && raw.pricingIntent
    ? raw.pricingIntent
    : targetInstruction.pricingIntent;

  return {
    assistantMessage: typeof raw.assistantMessage === "string" ? raw.assistantMessage : fallback.assistantMessage,
    proposedServices,
    changeSummary: Array.isArray(raw.changeSummary) ? raw.changeSummary.map(String) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
    pricingIntent,
    targetTotal,
    proposedTotal,
    targetVariance: targetTotal !== null ? roundCurrency(proposedTotal - targetTotal) : null,
    documentPricingDetected: typeof raw.documentPricingDetected === "boolean" ? raw.documentPricingDetected : null,
    instructionComplianceNotes: Array.isArray(raw.instructionComplianceNotes) ? raw.instructionComplianceNotes.map(String) : [],
  };
}

function getSearchTokens(value: string) {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "into",
    "estimate",
    "service",
    "project",
    "work",
    "please",
    "create",
    "make",
    "need",
    "want",
    "para",
    "com",
    "uma",
    "um",
    "que",
    "por",
    "favor",
  ]);

  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 4 && !stopWords.has(token))
    )
  );
}

function compactServiceCatalogForPrompt(params: {
  message: string;
  currentServices: SmartBuilderService[];
  serviceCatalog: any[];
  attachments: SmartBuilderAttachment[];
}) {
  const attachmentText = params.attachments
    .map((attachment) => `${attachment.originalName} ${attachment.extractedText || ""}`)
    .join(" ")
    .slice(0, 4000);
  const currentServiceText = params.currentServices
    .map((service) => `${service.name || ""} ${service.description || ""}`)
    .join(" ");
  const tokens = getSearchTokens(`${params.message} ${currentServiceText} ${attachmentText}`);

  const scoredServices = params.serviceCatalog.map((service, index) => {
    const searchable = [
      service.name,
      service.category,
      service.subcategory,
      service.description,
      service.priceType,
    ].join(" ").toLowerCase();
    const score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
    return { service, index, score };
  });

  scoredServices.sort((a, b) => b.score - a.score || a.index - b.index);

  const relevantServices = scoredServices
    .filter((item) => item.score > 0)
    .slice(0, MAX_PROMPT_CATALOG_SERVICES);

  const selectedServices = (relevantServices.length ? relevantServices : scoredServices.slice(0, MAX_PROMPT_CATALOG_SERVICES))
    .map(({ service }) => ({
      id: service.id,
      category: service.category,
      subcategory: service.subcategory,
      name: service.name,
      description: typeof service.description === "string" ? service.description.slice(0, 700) : service.description,
      priceType: service.priceType,
      fixedPrice: service.fixedPrice,
      minPrice: service.minPrice,
      maxPrice: service.maxPrice,
    }));

  return {
    totalAvailable: params.serviceCatalog.length,
    sentToModel: selectedServices.length,
    services: selectedServices,
  };
}

function compactMessages(messages: SmartBuilderMessage[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .slice(-HISTORY_LIMIT)
    .map((message) => ({
      role: message.role,
      content: String(message.content || "").slice(0, 8000),
    }));
}

async function buildCompanyCatalogServices(companyId?: string | null) {
  if (!companyId) return [];

  // Prisma Service maps to variable_service: catalog category -> subcategory -> service item.
  // It is not Project.ServiceProject or EstimateServiceProject.
  const loadCatalogServiceItems = (activeOnly: boolean) => prisma.service.findMany({
    where: {
      company_id: companyId,
      ...(activeOnly ? {
        service: {
          status_subcategory: {
            not: false,
          },
          subcategory: {
            status_category: {
              not: false,
            },
          },
        },
      } : {}),
    },
    select: {
      id: true,
      service_name: true,
      description: true,
      price_type: true,
      price_fixe: true,
      price_minimum: true,
      price_maximum: true,
      date_creation: true,
      service: {
        select: {
          subcategory_name: true,
          subcategory: {
            select: {
              category_name: true,
            },
          },
        },
      },
    },
    orderBy: { date_creation: "asc" },
    take: MAX_CATALOG_SERVICES,
  });

  let services = await loadCatalogServiceItems(true);
  if (!services.length && CATALOG_INCLUDE_INACTIVE_FALLBACK) {
    services = await loadCatalogServiceItems(false);
  }

  return services.map((service) => ({
    id: service.id,
    category: service.service.subcategory.category_name,
    subcategory: service.service.subcategory_name,
    name: service.service_name,
    description: service.description,
    priceType: service.price_type,
    fixedPrice: decimalToNumber(service.price_fixe, 0),
    minPrice: decimalToNumber(service.price_minimum, 0),
    maxPrice: decimalToNumber(service.price_maximum, 0),
  }));
}

async function getEstimateContext(estimateId: string) {
  return prisma.estimate.findUnique({
    where: { id: estimateId },
    select: {
      id: true,
      number: true,
      status: true,
      type_estimate: true,
      totalAmount: true,
      description: true,
      terms: true,
      project: {
        select: {
          id: true,
          contract_number: true,
          company_id: true,
          location: true,
          lat: true,
          log: true,
          radius: true,
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              location: true,
              addressOffice: true,
            },
          },
          company: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      serviceProjects: {
        orderBy: [
          { pos: "asc" },
          { date_creation: "asc" },
          { id: "asc" },
        ],
        select: {
          id: true,
          name: true,
          description: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          id_service: true,
          notes: true,
          pos: true,
          date_creation: true,
        },
      },
    },
  });
}

async function getOrCreateSession(estimateId: string, companyId?: string | null, userId?: string | null) {
  const existing = await prisma.estimateAiSession.findUnique({
    where: { estimateId },
    include: {
      messages: {
        orderBy: { date_creation: "asc" },
        include: { attachments: true },
      },
      attachments: {
        orderBy: { date_creation: "asc" },
      },
    },
  });

  if (existing) return existing;

  return prisma.estimateAiSession.create({
    data: {
      estimateId,
      companyId: companyId || null,
      createdById: userId || null,
      modelSimple: SERVICE_MODEL,
      modelDocument: DOC_MODEL,
      metadata: {},
    },
    include: {
      messages: {
        orderBy: { date_creation: "asc" },
        include: { attachments: true },
      },
      attachments: {
        orderBy: { date_creation: "asc" },
      },
    },
  });
}

function fileSupportsOpenAiFileInput(file: Express.Multer.File) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  return [
    ".pdf",
    ".txt",
    ".md",
    ".json",
    ".html",
    ".xml",
    ".doc",
    ".docx",
    ".rtf",
    ".odt",
    ".ppt",
    ".pptx",
    ".csv",
    ".tsv",
    ".xls",
    ".xlsx",
  ].includes(extension) || mime.includes("pdf") || mime.includes("text") || mime.includes("spreadsheet") || mime.includes("document");
}

async function tryExtractText(file: Express.Multer.File, buffer: Buffer) {
  const extension = path.extname(file.originalname || "").toLowerCase();
  const mime = (file.mimetype || "").toLowerCase();

  if (mime.startsWith("text/") || [".txt", ".md", ".csv", ".tsv", ".json", ".html", ".xml"].includes(extension)) {
    return buffer.toString("utf8").slice(0, MAX_TEXT_ATTACHMENT_CHARS);
  }

  if ([".xlsx", ".xls"].includes(extension)) {
    try {
      const xlsx = require("xlsx");
      const workbook = xlsx.read(buffer, { type: "buffer" });
      const sheets = workbook.SheetNames.slice(0, 5).map((sheetName: string) => {
        const csv = xlsx.utils.sheet_to_csv(workbook.Sheets[sheetName]).slice(0, 5000);
        return `Sheet: ${sheetName}\n${csv}`;
      });
      return sheets.join("\n\n").slice(0, MAX_TEXT_ATTACHMENT_CHARS);
    } catch {
      return null;
    }
  }

  if (extension === ".docx") {
    try {
      const mammoth = require("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return String(result?.value || "").slice(0, MAX_TEXT_ATTACHMENT_CHARS);
    } catch {
      return null;
    }
  }

  return null;
}

async function prepareAttachments(files: Express.Multer.File[] | undefined, userId: string | undefined) {
  const attachments: SmartBuilderAttachment[] = [];
  const contentParts: any[] = [];
  let hasDocumentAttachment = false;

  for (const file of files || []) {
    const buffer = fs.readFileSync(file.path);
    const extractedText = await tryExtractText(file, buffer);

    if (openai && file.mimetype?.startsWith("image/")) {
      contentParts.push({
        type: "input_image",
        image_url: `data:${file.mimetype};base64,${buffer.toString("base64")}`,
      });
      hasDocumentAttachment = true;
    } else if (openai && fileSupportsOpenAiFileInput(file)) {
      const uploadedFile = await openai.files.create({
        file: fs.createReadStream(file.path) as any,
        purpose: "user_data",
      } as any);
      contentParts.push({
        type: "input_file",
        file_id: uploadedFile.id,
      });
      hasDocumentAttachment = true;
    }

    const s3Key = userId ? await uploadFileToS3_2(file, userId, true) : null;

    attachments.push({
      fileName: path.basename(file.path),
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      s3Key,
      extractedText,
      summary: extractedText ? "Backend text extraction included in prompt." : "File stored and forwarded as model input when supported.",
    });
  }

  return {
    attachments,
    contentParts,
    hasDocumentAttachment,
  };
}

function buildUserPrompt(params: {
  message: string;
  currentServices: SmartBuilderService[];
  estimateContext: any;
  attachments: SmartBuilderAttachment[];
  grounding: SmartBuilderGrounding;
}) {
  const copyImportMode = hasImportPricingIntent(params.message, params.attachments);
  const pricingInstruction = extractTargetPricingInstruction(params.message);
  const attachmentText = params.attachments
    .filter((attachment) => attachment.extractedText)
    .map((attachment) => `Attachment ${attachment.originalName} extracted text:\n${attachment.extractedText}`)
    .join("\n\n");

  return JSON.stringify({
    smartBuilderContractReminder: "Follow the system SmartBuilder Contract. Latest user instruction has priority over history, document defaults, and market knowledge.",
    currentUserInstruction: buildCurrentUserInstructionBlock(params.message),
    pricingInstruction: buildPricingInstructionBlock(pricingInstruction),
    currentServices: normalizeServices(params.currentServices),
    editSafety: {
      currentServicesAreSourceOfTruth: params.currentServices.length > 0,
      rule: "If currentServices exist, return the full final list and keep unchanged services unless the latest user instruction asks to modify/remove them.",
    },
    estimateContext: params.estimateContext,
    marketResearch: {
      enabled: WEB_SEARCH_ENABLED,
      allowedByToolForRequest: params.grounding.allowWebSearch,
      toolName: "web_search_market_rates",
      used: params.grounding.webResearch.used,
      skippedReason: params.grounding.webResearch.skippedReason || null,
      summary: params.grounding.webResearch.summary || null,
      rule: "Use web market-rate context only as support for missing or scratch pricing. Never override explicit document prices unless the latest user instruction asks for a target/price change.",
    },
    documentContext: buildDocumentContextInstructions({
      copyImportMode,
      attachments: params.attachments,
      extractedAttachmentText: attachmentText || null,
    }),
    responseInstruction: {
      format: "Return only the JSON object requested by the schema.",
      metadata: "Fill pricingIntent, targetTotal, proposedTotal, targetVariance, documentPricingDetected, and instructionComplianceNotes honestly for auditing.",
      warnings: "Warnings should be useful and specific, not generic estimating disclaimers.",
    },
  });
}

function buildCurrentUserInstructionBlock(message: string) {
  return {
    raw: message,
    priority: "highest",
    rule: "Obey this instruction even if history or document defaults suggest something else, unless it conflicts with immutable explicit prices/scope that the user did not ask to change.",
  };
}

function buildPricingInstructionBlock(instruction: ReturnType<typeof extractTargetPricingInstruction>) {
  return {
    pricingIntent: instruction.pricingIntent,
    targetTotal: instruction.targetTotal,
    toleranceType: instruction.toleranceType,
    toleranceAmount: instruction.toleranceAmount,
    rules: {
      exact: "If pricingIntent is exact_total, match targetTotal within $1 when possible.",
      approximate: "If pricingIntent is approximate_total, stay within 2% when possible.",
      notExceed: "If pricingIntent is not_exceed, proposedTotal must not exceed targetTotal.",
      explainVariance: "If the target cannot be met without violating the user's scope or explicit document prices, explain the variance in instructionComplianceNotes and warnings.",
    },
  };
}

function buildDocumentContextInstructions(params: {
  copyImportMode: boolean;
  attachments: SmartBuilderAttachment[];
  extractedAttachmentText: string | null;
}) {
  return {
    hasAttachments: params.attachments.length > 0,
    copyImportRequested: params.copyImportMode,
    attachmentMetadata: params.attachments.map((attachment) => ({
      fileName: attachment.originalName,
      mimeType: attachment.mimeType || null,
      size: attachment.size || null,
      hasExtractedText: Boolean(attachment.extractedText),
    })),
    extractedAttachmentText: params.extractedAttachmentText,
    rule: params.copyImportMode
      ? "Use the document as baseline for structure/scope/prices, but still apply the latest user's requested changes such as target total, item edits, or description changes."
      : "Use attachments as supporting context unless the latest user instruction asks to copy/import/replicate/use them.",
    explicitPricingRule: "If explicit prices are detected in a copy/import document, preserve them exactly unless the latest user instruction asks to change pricing or target total.",
    missingPricingRule: "If copy/import document has no explicit prices, preserve structure/scope and estimate only prices. Add one concise warning.",
  };
}

function buildSmartBuilderResponseRequest(model: string, input: any[], options: {
  useReasoning?: boolean;
  enableVerbosity?: boolean;
  tools?: any[];
  toolChoice?: "auto" | "none";
  maxToolCalls?: number;
  maxOutputTokens?: number;
} = {}) {
  const tools = options.tools || [];

  return {
    model,
    instructions: SMARTBUILDER_SYSTEM_PROMPT,
    input,
    max_output_tokens: options.maxOutputTokens || OPENAI_MAX_OUTPUT_TOKENS,
    parallel_tool_calls: false,
    ...(tools.length ? { tools, tool_choice: options.toolChoice || "auto", max_tool_calls: options.maxToolCalls || OPENAI_MAX_SERVICE_TOOL_CALLS } : {}),
    ...buildReasoningOptions(model, options.useReasoning ? DOC_REASONING_EFFORT : SERVICE_REASONING_EFFORT, Boolean(options.useReasoning)),
    ...buildTextOptions(model, {
        type: "json_schema",
        name: "estimate_smartbuilder_response",
        strict: true,
        schema: smartBuilderJsonSchema,
    }, Boolean(options.enableVerbosity)),
  };
}

function buildCatalogSearchTool() {
  return {
    type: "function",
    name: "search_company_catalog_services",
    description: "Search only the current company's Category -> SubCategory -> Service/variable_service catalog for matching construction services, descriptions, and pricing anchors.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Short search query for the service category or line item, such as painting, siding, bathroom remodel, demolition, or cabinet installation.",
        },
        limit: {
          type: "number",
          description: "Maximum number of services to return. Use 5 to 12 for focused searches.",
        },
      },
      required: ["query", "limit"],
    },
    strict: true,
  };
}

function buildWebMarketRatesTool() {
  return {
    type: "function",
    name: "web_search_market_rates",
    description: "Search concise US market-rate references for labor/material pricing when the company catalog is insufficient.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Short US-market construction pricing query, for example 'Boston MA interior painting labor rate per square foot'.",
        },
        location: {
          type: "string",
          description: "Optional US city/state or region for pricing context.",
        },
      },
      required: ["query", "location"],
    },
    strict: true,
  };
}

function buildSmartBuilderTools(allowWebSearch: boolean, _allowCatalogSearch = true) {
  const tools: any[] = [];

  if (allowWebSearch) {
    tools.push(buildWebMarketRatesTool());
  }

  return tools;
}

function buildWebSearchOptions() {
  if (!WEB_SEARCH_ENABLED) return {};

  return {
    tools: [
      {
        type: WEB_SEARCH_TOOL_TYPE,
        search_context_size: "low",
        user_location: {
          type: "approximate",
          country: "US",
        },
      },
    ],
    tool_choice: "auto",
  };
}

function hasImportPricingIntent(message: string, attachments: SmartBuilderAttachment[]) {
  if (!attachments.length) return false;

  const normalizedMessage = message.toLowerCase();
  return [
    "copy",
    "copy this",
    "copy the",
    "copy from",
    "import",
    "replicate",
    "recreate",
    "duplicate",
    "extract",
    "transcribe",
    "convert this pdf",
    "turn this pdf",
    "use this pdf",
    "use the pdf",
    "use this file",
    "use the file",
    "from this pdf",
    "from the pdf",
    "based on this pdf",
    "based on the pdf",
    "same scope",
    "same price",
    "same prices",
    "use the values",
    "use these values",
    "copy this quote",
    "copy this proposal",
    "copy this bid",
    "copy this estimate",
    "import this quote",
    "import this proposal",
    "import this bid",
    "import this estimate",
    "use this quote",
    "use this proposal",
    "use this bid",
    "use this estimate",
    "replicate this quote",
    "replicate this proposal",
    "replicate this bid",
    "replicate this estimate",
    "orcamento",
    "orçamento",
    "proposta",
    "copie",
    "copia",
    "copiar",
    "importe",
    "importar",
    "replicar",
    "recriar",
    "extrair",
    "transcrever",
    "converter esse pdf",
    "usar esse pdf",
    "usar este pdf",
    "use esse pdf",
    "use este pdf",
    "a partir desse pdf",
    "a partir deste pdf",
    "igual ao pdf",
    "mesmo escopo",
    "mesmos valores",
    "usar os valores",
  ].some((term) => normalizedMessage.includes(term));
}

function shouldAllowWebSearch(params: {
  message: string;
  hasCompanyCatalog: boolean;
  catalogCandidates?: ReturnType<typeof compactServiceCatalogForPrompt>;
  attachments: SmartBuilderAttachment[];
}) {
  if (!WEB_SEARCH_ENABLED) return false;
  if (hasImportPricingIntent(params.message, params.attachments)) return false;
  if (!params.hasCompanyCatalog) return true;
  if (!params.catalogCandidates?.services?.length) return true;

  const hasCatalogPricing = params.catalogCandidates.services.some((service: any) => (
    moneyToNumber(service.fixedPrice, 0) > 0
    || moneyToNumber(service.minPrice, 0) > 0
    || moneyToNumber(service.maxPrice, 0) > 0
  ));
  if (!hasCatalogPricing) return true;

  const normalizedMessage = params.message.toLowerCase();
  return [
    "web",
    "search",
    "research",
    "market price",
    "market rate",
    "current price",
    "current rate",
    "average cost",
    "labor rate",
    "material cost",
  ].some((term) => normalizedMessage.includes(term));
}

async function getCompanyCatalogStats(companyId?: string | null) {
  if (!companyId) return null;

  const [
    categoriesTotal,
    categoriesActive,
    subcategoriesTotal,
    subcategoriesActive,
    servicesTotal,
    servicesActive,
  ] = await Promise.all([
    prisma.category.count({ where: { company_id: companyId } }),
    prisma.category.count({
      where: {
        company_id: companyId,
        status_category: { not: false },
      },
    }),
    prisma.subCategory.count({ where: { company_id: companyId } }),
    prisma.subCategory.count({
      where: {
        company_id: companyId,
        status_subcategory: { not: false },
      },
    }),
    prisma.service.count({ where: { company_id: companyId } }),
    prisma.service.count({
      where: {
        company_id: companyId,
        service: {
          status_subcategory: { not: false },
          subcategory: {
            status_category: { not: false },
          },
        },
      },
    }),
  ]);

  return {
    categoriesTotal,
    categoriesActive,
    subcategoriesTotal,
    subcategoriesActive,
    servicesTotal,
    servicesActive,
  };
}

async function searchCompanyCatalogForPrompt(params: {
  companyId?: string | null;
  message: string;
  currentServices: SmartBuilderService[];
  attachments: SmartBuilderAttachment[];
  importPricingIntent: boolean;
  traceId?: string;
}) {
  const shouldUseCatalog = CATALOG_GROUNDING_ENABLED
    && Boolean(params.companyId)
    && !params.importPricingIntent;
  const [catalogStats, serviceCatalog] = await Promise.all([
    shouldUseCatalog ? getCompanyCatalogStats(params.companyId) : Promise.resolve(null),
    shouldUseCatalog ? buildCompanyCatalogServices(params.companyId) : Promise.resolve([]),
  ]);
  const catalogCandidates = serviceCatalog.length
    ? compactServiceCatalogForPrompt({
      message: params.message,
      currentServices: params.currentServices,
      serviceCatalog,
      attachments: params.attachments,
    })
    : {
      totalAvailable: serviceCatalog.length,
      sentToModel: 0,
      services: [],
    };

  logSmartBuilderTrace(params.traceId, "catalog.grounding", {
    companyId: params.companyId || null,
    shouldUseCatalog,
    importPricingIntent: params.importPricingIntent,
    catalogGroundingEnabled: CATALOG_GROUNDING_ENABLED,
    catalogStats,
    serviceCatalogLoaded: serviceCatalog.length,
    inactiveFallbackUsed: Boolean(catalogStats && catalogStats.servicesActive === 0 && serviceCatalog.length > 0),
    catalogCandidatesSent: catalogCandidates.sentToModel,
    candidateNames: catalogCandidates.services.map((service: any) => service.name).slice(0, 10),
  });

  return {
    shouldUseCatalog,
    serviceCatalog,
    catalogCandidates,
    catalogStats,
  };
}

async function prepareCatalogToolContext(params: {
  companyId?: string | null;
  importPricingIntent: boolean;
  traceId?: string;
}) {
  const catalogStats = params.companyId ? await getCompanyCatalogStats(params.companyId) : null;
  const shouldUseCatalog = CATALOG_TOOL_ENABLED
    && Boolean(params.companyId)
    && !params.importPricingIntent;
  const emptyCatalogCandidates = {
    totalAvailable: catalogStats?.servicesTotal || 0,
    sentToModel: 0,
    services: [],
  };

  logSmartBuilderTrace(params.traceId, "catalog.toolContext", {
    companyId: params.companyId || null,
    shouldUseCatalog,
    importPricingIntent: params.importPricingIntent,
    catalogToolEnabled: CATALOG_TOOL_ENABLED,
    catalogStats,
    promptCatalogInjectionEnabled: CATALOG_GROUNDING_ENABLED,
  });

  return {
    shouldUseCatalog,
    serviceCatalog: [],
    catalogCandidates: emptyCatalogCandidates,
    catalogStats,
  };
}

function buildWebResearchPrompt(params: {
  message: string;
  currentServices: SmartBuilderService[];
  estimateContext: any;
  catalogCandidates: ReturnType<typeof compactServiceCatalogForPrompt>;
  attachments: SmartBuilderAttachment[];
}) {
  return [
    "Research concise US construction market pricing context for the estimate request below.",
    "Return only a compact paragraph or bullet list with realistic price/rate references and scope assumptions.",
    "Do not create final line items. Do not override explicit prices from attachments or matching company catalog anchors.",
    "If the request is too vague, give conservative pricing context and important assumptions.",
    JSON.stringify({
      userRequest: params.message,
      currentServices: normalizeServices(params.currentServices),
      projectLocation: params.estimateContext?.location || params.estimateContext?.project?.location || null,
      clientLocation: params.estimateContext?.client?.location || null,
      catalogCandidates: params.catalogCandidates.services.slice(0, 8),
      attachments: params.attachments.map((attachment) => ({
        fileName: attachment.originalName,
        mimeType: attachment.mimeType,
        hasExtractedText: Boolean(attachment.extractedText),
      })),
    }),
  ].join("\n\n");
}

async function runBoundedWebPricingResearch(params: {
  message: string;
  currentServices: SmartBuilderService[];
  estimateContext: any;
  catalogCandidates: ReturnType<typeof compactServiceCatalogForPrompt>;
  attachments: SmartBuilderAttachment[];
  allowWebSearch: boolean;
  traceId?: string;
}): Promise<SmartBuilderGrounding["webResearch"]> {
  if (!WEB_SEARCH_ENABLED) return { used: false, skippedReason: "web_search_disabled" };
  if (!params.allowWebSearch) return { used: false, skippedReason: "web_search_not_needed" };
  if (!openai) return { used: false, skippedReason: "openai_not_configured" };

  const startedAt = Date.now();
  const request = {
    model: SERVICE_MODEL,
    instructions: [
      "You are a US construction pricing research assistant.",
      "Use web search only for concise market context. Do not generate the final estimate JSON.",
      "Keep the response short and practical for an estimator.",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: buildWebResearchPrompt(params),
          },
        ],
      },
    ],
    max_output_tokens: OPENAI_WEB_RESEARCH_MAX_OUTPUT_TOKENS,
    max_tool_calls: 1,
    parallel_tool_calls: false,
    ...(buildWebSearchOptions() as any),
    ...buildReasoningOptions(SERVICE_MODEL, "low", false),
    ...buildTextOptions(SERVICE_MODEL, { type: "text" }),
  };

  logSmartBuilderTrace(params.traceId, "webResearch.start", {
    timeoutMs: WEB_SEARCH_TIMEOUT_MS,
    model: SERVICE_MODEL,
    input: summarizeSmartBuilderInput(request.input),
    tools: summarizeSmartBuilderTools((request as any).tools || []),
  });

  try {
    const response = await createOpenAiResponseWithTransientRetry(
      request,
      WEB_SEARCH_TIMEOUT_MS,
      "webResearch",
      0,
      params.traceId
    );
    const summary = getResponseText(response).slice(0, 3000);

    logSmartBuilderTrace(params.traceId, "webResearch.completed", {
      durationMs: Date.now() - startedAt,
      response: summarizeOpenAiResponse(response),
      summaryChars: summary.length,
    });

    return {
      used: Boolean(summary),
      skippedReason: summary ? undefined : "web_search_returned_empty",
      summary,
      responseId: response?.id || null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    logSmartBuilderTrace(params.traceId, "webResearch.failed", {
      durationMs: Date.now() - startedAt,
      error: summarizeSmartBuilderError(error),
    }, "warn");

    return {
      used: false,
      skippedReason: "web_search_failed",
      durationMs: Date.now() - startedAt,
      error: summarizeSmartBuilderError(error),
    };
  }
}

async function prepareSmartBuilderGrounding(params: {
  companyId?: string | null;
  message: string;
  currentServices: SmartBuilderService[];
  estimateContext: any;
  attachments: SmartBuilderAttachment[];
  traceId?: string;
}): Promise<SmartBuilderGrounding> {
  const importPricingIntent = hasImportPricingIntent(params.message, params.attachments);
  const catalog = CATALOG_GROUNDING_ENABLED
    ? await searchCompanyCatalogForPrompt({
      companyId: params.companyId,
      message: params.message,
      currentServices: params.currentServices,
      attachments: params.attachments,
      importPricingIntent,
      traceId: params.traceId,
    })
    : await prepareCatalogToolContext({
      companyId: params.companyId,
      importPricingIntent,
      traceId: params.traceId,
    });
  const allowWebSearch = WEB_SEARCH_ENABLED && !importPricingIntent;
  const webResearch = {
    used: false,
    skippedReason: allowWebSearch ? "tool_on_demand" : "web_search_not_allowed",
  };

  logSmartBuilderTrace(params.traceId, "grounding.completed", {
    companyId: params.companyId || null,
    importPricingIntent,
    shouldUseCatalog: catalog.shouldUseCatalog,
    serviceCatalogAvailable: catalog.serviceCatalog.length,
    catalogCandidatesSent: catalog.catalogCandidates.sentToModel,
    allowWebSearch,
    webResearchUsed: webResearch.used,
    webResearchSkippedReason: webResearch.skippedReason || null,
  });

  return {
    importPricingIntent,
    companyId: params.companyId || null,
    shouldUseCatalog: catalog.shouldUseCatalog,
    serviceCatalog: catalog.serviceCatalog,
    catalogCandidates: catalog.catalogCandidates,
    catalogStats: catalog.catalogStats,
    allowWebSearch,
    webResearch,
  };
}

async function searchCompanyServicesForAi(companyId: string | null | undefined, query: string, limit = 10) {
  if (!companyId) {
    return {
      services: [],
      warning: "No companyId was available, so the company service catalog could not be searched.",
    };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 20);
  const tokens = getSearchTokens(query).slice(0, 8);
  const searchConditions = tokens.flatMap((token) => [
    { service_name: { contains: token } },
    { description: { contains: token } },
    { price_type: { contains: token } },
    { service: { subcategory_name: { contains: token } } },
    { service: { subcategory: { category_name: { contains: token } } } },
  ]);

  const services = await prisma.service.findMany({
    where: {
      company_id: companyId,
      ...(searchConditions.length ? { OR: searchConditions } : {}),
    },
    select: {
      id: true,
      service_name: true,
      description: true,
      price_type: true,
      price_fixe: true,
      price_minimum: true,
      price_maximum: true,
      date_creation: true,
      service: {
        select: {
          status_subcategory: true,
          subcategory_name: true,
          subcategory: {
            select: {
              status_category: true,
              category_name: true,
            },
          },
        },
      },
    },
    orderBy: { date_creation: "asc" },
    take: safeLimit,
  });

  return {
    query,
    count: services.length,
    services: services.map((service) => ({
      id: service.id,
      category: service.service.subcategory.category_name,
      subcategory: service.service.subcategory_name,
      categoryStatus: service.service.subcategory.status_category,
      subcategoryStatus: service.service.status_subcategory,
      name: service.service_name,
      description: service.description,
      priceType: service.price_type,
      fixedPrice: moneyToNumber(service.price_fixe, 0),
      minPrice: moneyToNumber(service.price_minimum, 0),
      maxPrice: moneyToNumber(service.price_maximum, 0),
    })),
  };
}

async function runStandardWebSearch(params: {
  query: string;
  location?: string | null;
  traceId?: string;
}) {
  if (!WEB_SEARCH_ENABLED) {
    return { used: false, skippedReason: "web_search_disabled", summary: "" };
  }

  if (!openai) {
    return { used: false, skippedReason: "openai_not_configured", summary: "" };
  }

  const query = String(params.query || "").trim().slice(0, 240);
  if (!query) {
    return { used: false, skippedReason: "empty_query", summary: "" };
  }

  const startedAt = Date.now();
  const request = {
    model: SERVICE_MODEL,
    instructions: [
      "You are a concise US construction market-rate research tool.",
      "Use web search to return practical pricing references only.",
      "Do not produce a final estimate. Keep the answer under 8 bullets.",
    ].join("\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              query,
              location: params.location || "United States",
              output: "Summarize realistic labor/material price ranges and assumptions. Include no more than 8 bullets.",
            }),
          },
        ],
      },
    ],
    max_output_tokens: OPENAI_WEB_RESEARCH_MAX_OUTPUT_TOKENS,
    max_tool_calls: 1,
    parallel_tool_calls: false,
    ...(buildWebSearchOptions() as any),
    ...buildTextOptions(SERVICE_MODEL, { type: "text" }),
  };

  logSmartBuilderTrace(params.traceId, "webSearchTool.request", {
    agent: "web_search_market_rates",
    model: SERVICE_MODEL,
    reasoning: false,
    query,
    location: params.location || null,
    timeoutMs: WEB_SEARCH_TIMEOUT_MS,
    tools: summarizeSmartBuilderTools((request as any).tools || []),
  });

  try {
    const response = await createOpenAiResponseWithTransientRetry(
      request,
      WEB_SEARCH_TIMEOUT_MS,
      "webSearchTool",
      0,
      params.traceId
    );
    const summary = getResponseText(response).slice(0, 2500);

    logSmartBuilderTrace(params.traceId, "webSearchTool.response", {
      agent: "web_search_market_rates",
      durationMs: Date.now() - startedAt,
      response: summarizeOpenAiResponse(response),
      summaryChars: summary.length,
    });

    return {
      used: Boolean(summary),
      skippedReason: summary ? undefined : "web_search_returned_empty",
      summary,
      responseId: response?.id || null,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    logSmartBuilderTrace(params.traceId, "webSearchTool.failed", {
      agent: "web_search_market_rates",
      durationMs: Date.now() - startedAt,
      error: summarizeSmartBuilderError(error),
    }, "warn");

    return {
      used: false,
      skippedReason: "web_search_failed",
      summary: "",
      durationMs: Date.now() - startedAt,
      error: summarizeSmartBuilderError(error),
    };
  }
}

function getFunctionToolCalls(response: any) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.filter((item: any) => item?.type === "function_call" && item?.name);
}

async function executeFunctionToolCall(call: any, params: {
  companyId?: string | null;
  allowWebSearch?: boolean;
  traceId?: string;
}) {
  if (call.name === "search_company_catalog_services") {
    const args = safeParseAiJson(call.arguments || "{}");
    const result = await searchCompanyServicesForAi(params.companyId, String(args.query || ""), Number(args.limit || 10));

    logSmartBuilderTrace(params.traceId, "catalogTool.response", {
      agent: "service",
      tool: "search_company_catalog_services",
      catalogCompanyId: params.companyId || null,
      query: String(args.query || ""),
      catalogResultCount: result.count,
    });

    return {
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result),
    };
  }

  if (call.name === "web_search_market_rates") {
    const args = safeParseAiJson(call.arguments || "{}");
    const result = params.allowWebSearch
      ? await runStandardWebSearch({
        query: String(args.query || ""),
        location: String(args.location || ""),
        traceId: params.traceId,
      })
      : { used: false, skippedReason: "web_search_not_allowed", summary: "" };

    return {
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result),
    };
  }

  return {
    type: "function_call_output",
    call_id: call.call_id,
    output: JSON.stringify({ error: `Unsupported tool: ${call.name}` }),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  let timeout: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout!));
}

function inputHasNonTextParts(input: any[]) {
  return input.some((item) => Array.isArray(item?.content)
    && item.content.some((part: any) => part?.type && part.type !== "input_text"));
}

function stripInputToTextOnly(input: any[]) {
  return input.map((item) => {
    if (!Array.isArray(item?.content)) return item;

    return {
      ...item,
      content: item.content.filter((part: any) => part?.type === "input_text"),
    };
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorHeader(error: any, headerName: string) {
  const headers = error?.headers || error?.response?.headers;
  if (!headers) return null;

  if (typeof headers.get === "function") {
    return headers.get(headerName) || headers.get(headerName.toLowerCase()) || null;
  }

  return headers[headerName] || headers[headerName.toLowerCase()] || null;
}

function createSmartBuilderTraceId(scope: string) {
  return `${scope}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function summarizeSmartBuilderInput(input: any[] = []) {
  return input.reduce((summary, item) => {
    summary.messages += 1;

    if (item?.type === "function_call_output") {
      summary.functionOutputs += 1;
      summary.textChars += String(item.output || "").length;
      return summary;
    }

    const content = item?.content;
    if (typeof content === "string") {
      summary.textChars += content.length;
      return summary;
    }

    if (!Array.isArray(content)) return summary;

    for (const part of content) {
      summary.contentParts += 1;
      if (part?.type === "input_text") summary.textChars += String(part.text || "").length;
      else if (part?.type === "input_image") summary.imageParts += 1;
      else if (part?.type === "input_file") summary.fileParts += 1;
      else summary.otherParts += 1;
    }

    return summary;
  }, {
    messages: 0,
    contentParts: 0,
    textChars: 0,
    imageParts: 0,
    fileParts: 0,
    functionOutputs: 0,
    otherParts: 0,
  });
}

function summarizeSmartBuilderTools(tools: any[] = []) {
  const toolTypes = tools.map((tool) => tool?.type || tool?.name || "unknown");
  return {
    count: tools.length,
    types: toolTypes,
    hasCatalogSearch: tools.some((tool) => tool?.name === "search_company_catalog_services"),
    hasWebSearch: tools.some((tool) => String(tool?.type || "").includes("web_search") || tool?.name === "web_search_market_rates"),
  };
}

function summarizeOpenAiResponse(response: any) {
  const output = Array.isArray(response?.output) ? response.output : [];
  const outputTypes = output.map((item: any) => item?.type || "unknown");
  return {
    id: response?.id || null,
    status: response?.status || null,
    outputCount: output.length,
    outputTypes,
    functionCalls: output
      .filter((item: any) => item?.type === "function_call")
      .map((item: any) => ({ name: item.name, callId: item.call_id })),
    usage: response?.usage || null,
  };
}

function summarizeSmartBuilderError(error: any) {
  return {
    name: error?.name || null,
    message: error?.message || null,
    status: error?.status || error?.response?.status || null,
    code: error?.code || error?.error?.code || null,
    type: error?.type || error?.error?.type || null,
    requestID: error?.requestID || error?.request_id || null,
    retryAfter: getErrorHeader(error, "retry-after"),
    proxyStatus: getErrorHeader(error, "proxy-status"),
  };
}

function logSmartBuilderTrace(
  traceId: string | undefined,
  event: string,
  payload: Record<string, any> = {},
  level: "log" | "warn" | "error" = "log"
) {
  if (!SMARTBUILDER_TRACE_LOGS) return;

  const logPayload = {
    traceId,
    ...payload,
  };

  if (level === "error") {
    console.error(`[SmartBuilderEstimate.trace.${event}]`, logPayload);
    return;
  }

  if (level === "warn") {
    console.warn(`[SmartBuilderEstimate.trace.${event}]`, logPayload);
    return;
  }

  console.log(`[SmartBuilderEstimate.trace.${event}]`, logPayload);
}

function isOpenAiTimeoutError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return error?.name === "APIConnectionTimeoutError"
    || error?.code === "ETIMEDOUT"
    || message.includes("timed out")
    || message.includes("timeout");
}

function isOpenAiTransientError(error: any) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  const proxyStatus = String(getErrorHeader(error, "proxy-status") || "").toLowerCase();

  return isOpenAiTimeoutError(error)
    || [500, 502, 503, 504].includes(status)
    || (message.includes("status code") && ["500", "502", "503", "504"].some((code) => message.includes(code)))
    || proxyStatus.includes("http_response_incomplete")
    || proxyStatus.includes("cloudflare-proxy");
}

function getTransientRetryDelayMs(error: any) {
  const retryAfter = Number(getErrorHeader(error, "retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 5_000);
  }

  return Math.max(0, OPENAI_TRANSIENT_RETRY_DELAY_MS);
}

function createOpenAiResponse(request: any, timeoutMs: number) {
  return openai!.responses.create(request as any, { timeout: timeoutMs } as any);
}

async function createOpenAiResponseWithTransientRetry(
  request: any,
  timeoutMs: number,
  label: string,
  maxRetries = OPENAI_MAX_TRANSIENT_RETRIES,
  traceId?: string
) {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const startedAt = Date.now();

    logSmartBuilderTrace(traceId, `${label}.request`, {
      attempt: attempt + 1,
      maxAttempts: maxRetries + 1,
      model: request?.model,
      timeoutMs,
      maxOutputTokens: request?.max_output_tokens,
      toolChoice: request?.tool_choice || null,
      input: summarizeSmartBuilderInput(request?.input || []),
      tools: summarizeSmartBuilderTools(request?.tools || []),
    });

    try {
      const response = await createOpenAiResponse(request, timeoutMs);
      logSmartBuilderTrace(traceId, `${label}.response`, {
        attempt: attempt + 1,
        durationMs: Date.now() - startedAt,
        response: summarizeOpenAiResponse(response),
      });
      return response;
    } catch (error) {
      lastError = error;
      logSmartBuilderTrace(traceId, `${label}.error`, {
        attempt: attempt + 1,
        durationMs: Date.now() - startedAt,
        error: summarizeSmartBuilderError(error),
        transient: isOpenAiTransientError(error),
      }, "warn");

      if (!isOpenAiTransientError(error) || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = getTransientRetryDelayMs(error);
      logSmartBuilderTrace(traceId, `${label}.transientRetry`, {
        attempt: attempt + 1,
        nextAttempt: attempt + 2,
        status: (error as any)?.status,
        code: (error as any)?.code,
        delayMs,
      }, "warn");
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function buildEstimateGenerationInput(params: {
  priorMessages: SmartBuilderMessage[];
  userPrompt: string;
  contentParts: any[];
}) {
  return [
    ...compactMessages(params.priorMessages),
    {
      role: "user",
      content: [
        { type: "input_text", text: params.userPrompt },
        ...params.contentParts,
      ],
    },
  ];
}

async function resolveFunctionToolCalls(response: any, params: {
  model: string;
  input: any[];
  companyId?: string | null;
  allowWebSearch?: boolean;
  traceId?: string;
}) {
  const toolCalls = getFunctionToolCalls(response);
  if (!toolCalls.length) return response;
  const toolNames = toolCalls.map((call: any) => String(call.name || ""));

  logSmartBuilderTrace(params.traceId, "tools.detected", {
    responseId: response?.id || null,
    toolCallCount: toolCalls.length,
    toolCalls: toolCalls.map((call: any) => ({
      name: call.name,
      callId: call.call_id,
      argumentChars: String(call.arguments || "").length,
    })),
  });

  const toolOutputs = await Promise.all(
    toolCalls.slice(0, OPENAI_MAX_SERVICE_TOOL_CALLS).map((call: any) => executeFunctionToolCall(call, {
      companyId: params.companyId,
      allowWebSearch: params.allowWebSearch,
      traceId: params.traceId,
    }))
  );

  logSmartBuilderTrace(params.traceId, "tools.outputs", {
    outputCount: toolOutputs.length,
    outputs: toolOutputs.map((output: any) => ({
      callId: output.call_id,
      outputChars: String(output.output || "").length,
      parsedCount: safeParseAiJson(output.output)?.count ?? null,
    })),
  });

  const followUpRequest = {
    ...buildSmartBuilderResponseRequest(params.model, toolOutputs, {
      tools: [],
      toolChoice: "none",
      useReasoning: false,
      enableVerbosity: false,
    }),
    previous_response_id: response.id,
    tool_choice: "none",
  };

  const followUpResponse = await createOpenAiResponseWithTransientRetry(
    followUpRequest,
    OPENAI_RETRY_TIMEOUT_MS,
    "toolFollowUp",
    OPENAI_MAX_TRANSIENT_RETRIES,
    params.traceId
  );

  return Object.assign(followUpResponse, {
    __smartBuilderToolUsage: {
      toolCalls: toolNames,
      catalogSearchUsed: toolNames.includes("search_company_catalog_services"),
      webSearchUsed: toolNames.includes("web_search_market_rates"),
    },
  });
}

function getSmartBuilderErrorResponse(error: any) {
  const code = error?.code || error?.error?.code;
  const type = error?.type || error?.error?.type;
  const status = Number(error?.status || 0);

  if (code === "insufficient_quota" || type === "insufficient_quota") {
    return {
      status: 402,
      body: {
        success: false,
        error: "SmartBuilder AI is temporarily unavailable. Please try again in a few minutes or contact support if the issue continues.",
        code: "openai_insufficient_quota",
      },
    };
  }

  if (status === 429 || code === "rate_limit_exceeded" || type === "rate_limit_exceeded") {
    return {
      status: 429,
      body: {
        success: false,
        error: "SmartBuilder AI is receiving too many requests right now. Please wait a moment and try again.",
        code: "openai_rate_limit",
      },
    };
  }

  if (isOpenAiTimeoutError(error)) {
    return {
      status: 504,
      body: {
        success: false,
        error: "SmartBuilder AI took too long to generate this estimate. Please try again with a smaller file or a more focused request.",
        code: "openai_timeout",
      },
    };
  }

  if (isOpenAiTransientError(error)) {
    return {
      status: 503,
      body: {
        success: false,
        error: "SmartBuilder AI is temporarily overloaded. Please wait a moment and try again.",
        code: "openai_temporarily_unavailable",
      },
    };
  }

  return null;
}

async function createFileContextAgentResponse(params: {
  input: any[];
  companyId?: string | null;
  traceId?: string;
}) {
  const request = {
    model: DOC_MODEL,
    instructions: [
      "You are fileContextAgent for SmartBuilder estimates.",
      "Read the attached PDF/image/document inputs and extract only compact, useful estimating context.",
      "Return a compact structured text report using the exact labels below. Do not return prose before or after the report.",
      "DOCUMENT_HAS_EXPLICIT_PRICING: true or false.",
      "SOURCE_STRUCTURE: one of priced_line_item_based, unit_based, room_based, phase_based, section_based, allowance_or_alternate_based, summary_total_only, mixed, unknown.",
      "PRICES_FOUND: list exact prices/totals found with their source labels, or none.",
      "MISSING_PRICES: list source groups/items that have scope but no explicit pricing, or none.",
      "SCOPE_BY_UNIT_OR_SECTION: preserve the document's own unit/room/phase/section grouping. For each group, include its exact title and concise copied scope bullets.",
      "LINE_ITEMS: include explicit line items only when the document itself presents separate line items or priced rows. Include name, quantity, unit price, total, and copied scope when present.",
      "EXCLUSIONS_OR_ALTERNATES: include only exclusions/alternates explicitly stated in the document.",
      "IMPORTANT_COPY_NOTES: explain which source groups should become services and why. Mention any document-level/common/general groups only if the document presents them as distinct scope, allowance, alternate, or priced line item.",
      "If the file is existing estimate/proposal/bid/quote, preserve original names, values, quantities, totals, section titles, and unit labels exactly in the report.",
      "If pricing is absent, say DOCUMENT_HAS_EXPLICIT_PRICING: false and do not invent pricing in this file-context report.",
      "If the user's current request asks to copy/import and also adjust totals, wording, services, or values, extract the source facts without deciding the final adjustment.",
      "Do not add assumptions, exclusions, code/licensing language, HVAC, hidden damage, structural scope, or quality standards unless the document explicitly says them.",
      "Keep output concise and under the configured token budget.",
    ].join("\n"),
    input: params.input,
    max_output_tokens: OPENAI_DOC_CONTEXT_MAX_OUTPUT_TOKENS,
    parallel_tool_calls: false,
    ...buildReasoningOptions(DOC_MODEL, DOC_REASONING_EFFORT, true),
    ...buildTextOptions(DOC_MODEL, { type: "text" }, true),
  };

  logSmartBuilderTrace(params.traceId, "fileContextAgent.start", {
    agent: "fileContext",
    model: DOC_MODEL,
    reasoning: supportsReasoningControls(DOC_MODEL),
    companyId: params.companyId || null,
    timeoutMs: OPENAI_REQUEST_TIMEOUT_MS,
    maxOutputTokens: OPENAI_DOC_CONTEXT_MAX_OUTPUT_TOKENS,
    input: summarizeSmartBuilderInput(params.input),
  });

  return createOpenAiResponseWithTransientRetry(
    request,
    OPENAI_REQUEST_TIMEOUT_MS,
    "fileContext",
    OPENAI_MAX_TRANSIENT_RETRIES,
    params.traceId
  );
}

async function createStructuredEstimateResponse(params: {
  model: string;
  input: any[];
  hasDocumentAttachment: boolean;
  companyId?: string | null;
  allowWebSearch?: boolean;
  importPricingIntent?: boolean;
  traceId?: string;
}) {
  if (!openai) {
    throw new Error("OpenAI API key is not configured");
  }

  logSmartBuilderTrace(params.traceId, "response.start", {
    agent: params.hasDocumentAttachment ? "fileContext+service" : "service",
    model: params.hasDocumentAttachment ? SERVICE_MODEL : params.model,
    serviceModel: SERVICE_MODEL,
    docModel: DOC_MODEL,
    hasDocumentAttachment: params.hasDocumentAttachment,
    webSearchEnabled: WEB_SEARCH_ENABLED,
    companyId: params.companyId || null,
    input: summarizeSmartBuilderInput(params.input),
  });

  let serviceInput = inputHasNonTextParts(params.input) && !params.hasDocumentAttachment
    ? stripInputToTextOnly(params.input)
    : params.input;

  if (params.hasDocumentAttachment) {
    const fileContext = await createFileContextAgentResponse({
      input: params.input,
      companyId: params.companyId,
      traceId: params.traceId,
    });
    const fileContextText = getResponseText(fileContext).slice(0, 9000);
    serviceInput = [
      ...stripInputToTextOnly(params.input),
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Document context extracted by fileContextAgent. Use this as attachment context for the final service proposal.",
              "If the user asks to copy/import/replicate/use this document, the document context is the baseline for service structure and scope.",
              "The latest user instruction still has priority. If the user asked to copy/import and also adjust pricing, total, descriptions, or scope, preserve the document baseline while applying those requested changes.",
              "For copy/import mode, follow SOURCE_STRUCTURE and IMPORTANT_COPY_NOTES. Convert the document's real commercial groups into services: priced rows, units, rooms, phases, sections, allowances, alternates, or distinct general/common groups.",
              "Only create a separate document-level/general/common service when the document presents it as a distinct scope group, allowance, alternate, or priced line item. Avoid derived summary services that duplicate scope already inside other services.",
              "If DOCUMENT_HAS_EXPLICIT_PRICING is false, keep the copied service names/descriptions faithful to SCOPE_BY_UNIT_OR_SECTION and estimate only the money fields. Add one warning that pricing was estimated because the document did not include explicit prices.",
              "If DOCUMENT_HAS_EXPLICIT_PRICING is true, copy quantities, unit prices, and totals exactly from LINE_ITEMS/PRICES_FOUND unless the latest user instruction explicitly asks to change pricing or match a target total.",
              "Do not add scope that is absent from the document context.",
              fileContextText || "No readable document context was extracted.",
            ].join("\n\n"),
          },
        ],
      },
    ];
  }

  const serviceTools = buildSmartBuilderTools(Boolean(params.allowWebSearch), !params.importPricingIntent);
  const request = {
    ...buildSmartBuilderResponseRequest(SERVICE_MODEL, serviceInput, {
      tools: serviceTools,
      toolChoice: serviceTools.length ? "auto" : "none",
      useReasoning: false,
      enableVerbosity: false,
    }),
  };

  logSmartBuilderTrace(params.traceId, "serviceAgent.start", {
    agent: "service",
    model: SERVICE_MODEL,
    reasoning: false,
    allowWebSearch: Boolean(params.allowWebSearch),
    importPricingIntent: Boolean(params.importPricingIntent),
    tools: summarizeSmartBuilderTools(serviceTools),
    input: summarizeSmartBuilderInput(serviceInput),
  });

  const response = await createOpenAiResponseWithTransientRetry(
    request,
    OPENAI_REQUEST_TIMEOUT_MS,
    "generate",
    OPENAI_MAX_TRANSIENT_RETRIES,
    params.traceId
  );

  return resolveFunctionToolCalls(response, {
    model: SERVICE_MODEL,
    input: serviceInput,
    companyId: params.companyId,
    allowWebSearch: params.allowWebSearch,
    traceId: params.traceId,
  });
}

function hasRemovalInstruction(message: string) {
  const normalized = String(message || "").toLowerCase();
  return [
    "remove",
    "delete",
    "drop",
    "exclude",
    "take out",
    "get rid",
    "remover",
    "deletar",
    "tirar",
    "excluir",
  ].some((term) => normalized.includes(term));
}

function hasExplicitPriceChangeInstruction(message: string) {
  const normalized = String(message || "").toLowerCase();
  return [
    "target",
    "total",
    "budget",
    "price",
    "cost",
    "amount",
    "adjust",
    "change",
    "set",
    "not exceed",
    "valor",
    "preco",
    "preço",
    "orçamento",
    "orcamento",
    "alterar",
    "ajustar",
  ].some((term) => normalized.includes(term));
}

function hasLikelyNonEnglishText(value: string) {
  const normalized = String(value || "").toLowerCase();
  return /[ãõçáéíóúâêôà]/i.test(normalized)
    || /\b(servi[cç]o|m[aã]o de obra|or[cç]amento|projeto|paredes|pintura|instala[cç][aã]o|remo[cç][aã]o|limpeza|acabamento)\b/i.test(normalized);
}

function looksLikeDerivedCopyImportSummary(service: SmartBuilderService) {
  const text = `${service.name || ""} ${service.description || ""}`.toLowerCase();
  return [
    "applied to all units",
    "standard finishes applied",
    "general finishes applied",
    "common scope applied",
    "all units standard",
    "overall standard",
  ].some((term) => text.includes(term));
}

function validateSmartBuilderProposal(params: {
  parsed: ReturnType<typeof normalizeAiResponse>;
  currentServices: SmartBuilderService[];
  message: string;
  attachments: SmartBuilderAttachment[];
  importPricingIntent: boolean;
}) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const proposedServices = params.parsed.proposedServices || [];
  const targetInstruction = extractTargetPricingInstruction(params.message);
  const targetTotal = params.parsed.targetTotal ?? targetInstruction.targetTotal;
  const pricingIntent = params.parsed.pricingIntent || targetInstruction.pricingIntent;
  const proposedTotal = sumServicesTotal(proposedServices);

  if (!proposedServices.length) {
    errors.push("The proposal must include at least one service.");
  }

  proposedServices.forEach((service, index) => {
    const quantity = decimalToNumber(service.quantity, 1) || 1;
    const unitPrice = moneyToNumber(service.unitPrice, 0);
    const expectedLineTotal = roundCurrency(quantity * unitPrice);
    const actualLineTotal = moneyToNumber(service.lineTotal, expectedLineTotal);

    if (Math.abs(actualLineTotal - expectedLineTotal) > 1) {
      errors.push(`Service ${index + 1} lineTotal must match quantity * unitPrice within normal currency rounding.`);
    }

    if (hasLikelyNonEnglishText(`${service.name || ""} ${service.description || ""} ${service.notes || ""}`)) {
      errors.push(`Service ${index + 1} appears to contain non-English wording. All proposal text must be American English.`);
    }
  });

  if (
    params.currentServices.length > 0
    && proposedServices.length < params.currentServices.length
    && !hasRemovalInstruction(params.message)
  ) {
    errors.push("The proposal removed existing services even though the user did not ask to remove services.");
  }

  if (params.importPricingIntent && params.attachments.length > 0) {
    if (proposedServices.some(looksLikeDerivedCopyImportSummary)) {
      errors.push("The copy/import proposal appears to add a derived all-units/general summary service that may duplicate source-document scope.");
    }

    if (params.parsed.documentPricingDetected && !hasExplicitPriceChangeInstruction(params.message)) {
      warnings.push("Document pricing was detected; explicit document values should be preserved unless the user requested pricing changes.");
    }
  }

  if (targetTotal !== null && Number.isFinite(Number(targetTotal))) {
    const numericTarget = Number(targetTotal);
    const variance = roundCurrency(proposedTotal - numericTarget);

    if (pricingIntent === "not_exceed" && proposedTotal > numericTarget + 1) {
      errors.push(`The proposal total ${proposedTotal} exceeds the user's not-to-exceed target ${numericTarget}.`);
    }

    if (pricingIntent === "exact_total" && Math.abs(variance) > 1) {
      errors.push(`The proposal total ${proposedTotal} does not match the user's exact target ${numericTarget} within $1.`);
    }

    if (pricingIntent === "approximate_total") {
      const tolerance = roundCurrency(numericTarget * 0.02);
      if (Math.abs(variance) > tolerance) {
        errors.push(`The proposal total ${proposedTotal} is outside the 2% tolerance for the user's approximate target ${numericTarget}.`);
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    proposedTotal,
    targetTotal,
    pricingIntent,
  };
}

async function repairSmartBuilderProposalIfNeeded(params: {
  parsed: ReturnType<typeof normalizeAiResponse>;
  currentServices: SmartBuilderService[];
  message: string;
  attachments: SmartBuilderAttachment[];
  importPricingIntent: boolean;
  hasDocumentAttachment: boolean;
  companyId?: string | null;
  traceId?: string;
}) {
  const validation = validateSmartBuilderProposal({
    parsed: params.parsed,
    currentServices: params.currentServices,
    message: params.message,
    attachments: params.attachments,
    importPricingIntent: params.importPricingIntent,
  });

  if (validation.passed) {
    return {
      parsed: {
        ...params.parsed,
        proposedTotal: validation.proposedTotal,
        targetTotal: validation.targetTotal ?? params.parsed.targetTotal,
        targetVariance: validation.targetTotal !== null && validation.targetTotal !== undefined
          ? roundCurrency(validation.proposedTotal - Number(validation.targetTotal))
          : params.parsed.targetVariance,
        warnings: [...params.parsed.warnings, ...validation.warnings],
      },
      validation,
      repaired: false,
    };
  }

  if (!openai) {
    return {
      parsed: {
        ...params.parsed,
        warnings: [...params.parsed.warnings, ...validation.warnings],
      },
      validation,
      repaired: false,
    };
  }

  logSmartBuilderTrace(params.traceId, "proposal.validation.failed", {
    errors: validation.errors,
    warnings: validation.warnings,
    proposedTotal: validation.proposedTotal,
    targetTotal: validation.targetTotal,
    pricingIntent: validation.pricingIntent,
  }, "warn");

  const repairInput = [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: JSON.stringify({
            task: "Repair this SmartBuilder proposal JSON. Return the full corrected JSON only.",
            latestUserInstruction: params.message,
            validationErrors: validation.errors,
            validationWarnings: validation.warnings,
            targetPricingInstruction: extractTargetPricingInstruction(params.message),
            currentServices: normalizeServices(params.currentServices),
            importPricingIntent: params.importPricingIntent,
            hasDocumentAttachment: params.hasDocumentAttachment,
            repairRules: [
              "Fix every validation error.",
              "Do not remove existing services unless the latest user instruction asks for removal.",
              "Keep all text in professional American English.",
              "If copy/import is active, preserve source structure/scope and explicit prices unless the latest user instruction asks for price changes.",
              "If a target total exists, adjust service prices proportionally or intelligently so the proposedTotal satisfies the tolerance.",
              "Keep descriptions detailed and safe HTML.",
              "Return the same schema fields, including metadata fields.",
            ],
            previousProposal: params.parsed,
          }),
        },
      ],
    },
  ];

  try {
    const repairResponse = await createOpenAiResponseWithTransientRetry(
      {
        ...buildSmartBuilderResponseRequest(SERVICE_MODEL, repairInput, {
          tools: [],
          toolChoice: "none",
          useReasoning: false,
          enableVerbosity: false,
          maxOutputTokens: Math.min(OPENAI_MAX_OUTPUT_TOKENS, 3600),
        }),
      },
      OPENAI_RETRY_TIMEOUT_MS,
      "repair",
      0,
      params.traceId
    );
    const repaired = normalizeAiResponse(safeParseAiJson(getResponseText(repairResponse)), params.currentServices, params.message);
    const repairedValidation = validateSmartBuilderProposal({
      parsed: repaired,
      currentServices: params.currentServices,
      message: params.message,
      attachments: params.attachments,
      importPricingIntent: params.importPricingIntent,
    });

    logSmartBuilderTrace(params.traceId, "proposal.repair.completed", {
      responseId: repairResponse?.id || null,
      passed: repairedValidation.passed,
      errors: repairedValidation.errors,
      warnings: repairedValidation.warnings,
      proposedTotal: repairedValidation.proposedTotal,
      targetTotal: repairedValidation.targetTotal,
    });

    if (repairedValidation.passed || repairedValidation.errors.length <= validation.errors.length) {
      return {
        parsed: {
          ...repaired,
          proposedTotal: repairedValidation.proposedTotal,
          targetTotal: repairedValidation.targetTotal ?? repaired.targetTotal,
          targetVariance: repairedValidation.targetTotal !== null && repairedValidation.targetTotal !== undefined
            ? roundCurrency(repairedValidation.proposedTotal - Number(repairedValidation.targetTotal))
            : repaired.targetVariance,
          warnings: [...repaired.warnings, ...repairedValidation.warnings],
        },
        validation: repairedValidation,
        repaired: true,
      };
    }
  } catch (error) {
    logSmartBuilderTrace(params.traceId, "proposal.repair.failed", {
      error: summarizeSmartBuilderError(error),
    }, "warn");
  }

  return {
    parsed: {
      ...params.parsed,
      warnings: [...params.parsed.warnings, ...validation.warnings],
    },
    validation,
    repaired: false,
  };
}

function serializeSession(session: any) {
  return {
    id: session.id,
    estimateId: session.estimateId ?? null,
    companyId: session.companyId ?? null,
    status: session.status,
    metadata: session.metadata ?? {},
    messages: (session.messages || []).map((message: any) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      payload: message.payload ?? null,
      responseId: message.responseId ?? null,
      date_creation: message.date_creation,
      attachments: (message.attachments || []).map((attachment: any) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        s3Key: attachment.s3Key,
        extractedText: attachment.extractedText,
        summary: attachment.summary,
      })),
    })),
    attachments: (session.attachments || []).map((attachment: any) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      s3Key: attachment.s3Key,
      extractedText: attachment.extractedText,
      summary: attachment.summary,
    })),
  };
}

export class SmartBuilderEstimateController {
  async getSession(req: Request, res: Response) {
    const { estimateId } = req.params;

    try {
      const session = await prisma.estimateAiSession.findUnique({
        where: { estimateId },
        include: {
          messages: {
            orderBy: { date_creation: "asc" },
            include: { attachments: true },
          },
          attachments: {
            orderBy: { date_creation: "asc" },
          },
        },
      });

      return res.status(200).json({
        success: true,
        data: session ? serializeSession(session) : null,
      });
    } catch (error) {
      console.error("[SmartBuilderEstimate.getSession]", error);
      return res.status(500).json({ success: false, error: "Failed to load SmartBuilder session" });
    }
  }

  async messageExisting(req: Request, res: Response) {
    const { estimateId } = req.params;
    const userId = (req as any).userId as string | undefined;
    const traceId = createSmartBuilderTraceId("existing");

    try {
      if (!openai) {
        return res.status(500).json({ success: false, error: "OpenAI API key is not configured" });
      }

      const estimate = await getEstimateContext(estimateId);
      if (!estimate) {
        return res.status(404).json({ success: false, error: "Estimate not found" });
      }

      const message = String(req.body.message || "").trim();
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }

      const currentServices = parseJsonField<SmartBuilderService[]>(
        req.body.currentServices,
        estimate.serviceProjects as any
      );

      const session = await getOrCreateSession(estimateId, estimate.project.company_id, userId);
      const prepared = await prepareAttachments(req.files as Express.Multer.File[] | undefined, userId);
      const estimateContext = {
        id: estimate.id,
        number: estimate.number,
        status: estimate.status,
        type: estimate.type_estimate,
        project: estimate.project,
      };
      const grounding = await prepareSmartBuilderGrounding({
        companyId: estimate.project.company_id,
        message,
        currentServices,
        estimateContext,
        attachments: prepared.attachments,
        traceId,
      });
      const userPrompt = buildUserPrompt({
        message,
        currentServices,
        estimateContext,
        attachments: prepared.attachments,
        grounding,
      });

      const userMessage = await prisma.estimateAiMessage.create({
        data: {
          sessionId: session.id,
          role: "user",
          content: message,
          payload: {
            currentServices: normalizeServices(currentServices),
            attachmentCount: prepared.attachments.length,
          },
        },
      });

      if (prepared.attachments.length) {
        await prisma.estimateAiAttachment.createMany({
          data: prepared.attachments.map((attachment) => ({
            sessionId: session.id,
            messageId: userMessage.id,
            fileName: attachment.fileName,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType || null,
            size: attachment.size || null,
            s3Key: attachment.s3Key || null,
            extractedText: attachment.extractedText || null,
            summary: attachment.summary || null,
          })),
        });
      }

      const userAttachments = prepared.attachments.length
        ? await prisma.estimateAiAttachment.findMany({ where: { messageId: userMessage.id } })
        : [];

      const input = buildEstimateGenerationInput({
        priorMessages: (session.messages || []) as any,
        userPrompt,
        contentParts: prepared.contentParts,
      });

      logSmartBuilderTrace(traceId, "messageExisting.context", {
        estimateId,
        companyId: estimate.project.company_id || null,
        userId: userId || null,
        messageChars: message.length,
        currentServicesCount: currentServices.length,
        priorMessageCount: Array.isArray(session.messages) ? session.messages.length : 0,
        attachments: prepared.attachments.map((attachment) => ({
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          hasExtractedText: Boolean(attachment.extractedText),
          extractedTextChars: attachment.extractedText?.length || 0,
        })),
        contentPartsCount: prepared.contentParts.length,
        hasDocumentAttachment: prepared.hasDocumentAttachment,
        importPricingIntent: grounding.importPricingIntent,
        allowWebSearch: grounding.allowWebSearch,
        catalogToolEnabled: false,
        serviceCatalogAvailable: grounding.serviceCatalog.length,
        catalogStats: grounding.catalogStats,
        catalogCandidatesSent: grounding.catalogCandidates.sentToModel,
        webResearchUsed: grounding.webResearch.used,
        webResearchSkippedReason: grounding.webResearch.skippedReason || null,
        input: summarizeSmartBuilderInput(input),
      });

      const response = await createStructuredEstimateResponse({
        model: prepared.hasDocumentAttachment ? DOC_MODEL : SERVICE_MODEL,
        input,
        hasDocumentAttachment: prepared.hasDocumentAttachment,
        companyId: estimate.project.company_id,
        allowWebSearch: grounding.allowWebSearch,
        importPricingIntent: grounding.importPricingIntent,
        traceId,
      });
      const toolUsage = (response as any).__smartBuilderToolUsage || {};

      const rawText = getResponseText(response);
      const initialParsed = normalizeAiResponse(safeParseAiJson(rawText), currentServices, message);
      const proposalResult = await repairSmartBuilderProposalIfNeeded({
        parsed: initialParsed,
        currentServices,
        message,
        attachments: prepared.attachments,
        importPricingIntent: grounding.importPricingIntent,
        hasDocumentAttachment: prepared.hasDocumentAttachment,
        companyId: estimate.project.company_id,
        traceId,
      });
      const parsed = proposalResult.parsed;

      const assistantMessage = await prisma.estimateAiMessage.create({
        data: {
          sessionId: session.id,
          role: "assistant",
          content: parsed.assistantMessage,
          payload: parsed,
          responseId: response.id,
        },
      });

      await prisma.estimateAiSession.update({
        where: { id: session.id },
        data: {
          lastResponseId: response.id,
          modelSimple: SERVICE_MODEL,
          modelDocument: DOC_MODEL,
          metadata: {
            ...(session.metadata ? (session.metadata as any) : {}),
            webSearchEnabled: WEB_SEARCH_ENABLED,
            webSearchAllowedForLastRequest: grounding.allowWebSearch,
            webSearchUsedForLastRequest: Boolean(toolUsage.webSearchUsed || grounding.webResearch.used),
            catalogSearchUsedForLastRequest: false,
            lastProposalValidationPassed: proposalResult.validation.passed,
            lastProposalRepaired: proposalResult.repaired,
            lastProposalValidationErrors: proposalResult.validation.errors,
          },
        },
      });

      return res.status(200).json({
        success: true,
        data: {
          assistantMessage: parsed.assistantMessage,
          proposedServices: parsed.proposedServices,
          changeSummary: parsed.changeSummary,
          warnings: parsed.warnings,
          pricingIntent: parsed.pricingIntent,
          targetTotal: parsed.targetTotal,
          proposedTotal: parsed.proposedTotal,
          targetVariance: parsed.targetVariance,
          documentPricingDetected: parsed.documentPricingDetected,
          instructionComplianceNotes: parsed.instructionComplianceNotes,
          session: {
            id: session.id,
            messages: [
              {
                id: userMessage.id,
                role: "user",
                content: userMessage.content,
                attachments: userAttachments,
                date_creation: userMessage.date_creation,
              },
              {
                id: assistantMessage.id,
                role: "assistant",
                content: assistantMessage.content,
                payload: assistantMessage.payload,
                responseId: assistantMessage.responseId,
                date_creation: assistantMessage.date_creation,
              },
            ],
          },
        },
      });
    } catch (error) {
      logSmartBuilderTrace(traceId, "messageExisting.error", {
        error: summarizeSmartBuilderError(error),
      }, "error");
      const smartBuilderError = getSmartBuilderErrorResponse(error);
      if (smartBuilderError) {
        return res.status(smartBuilderError.status).json(smartBuilderError.body);
      }
      return res.status(500).json({ success: false, error: "Failed to process SmartBuilder message" });
    }
  }

  async messageDraft(req: Request, res: Response) {
    const userId = (req as any).userId as string | undefined;
    const traceId = createSmartBuilderTraceId("draft");

    try {
      if (!openai) {
        return res.status(500).json({ success: false, error: "OpenAI API key is not configured" });
      }

      const message = String(req.body.message || "").trim();
      if (!message) {
        return res.status(400).json({ success: false, error: "Message is required" });
      }

      const currentServices = parseJsonField<SmartBuilderService[]>(req.body.currentServices, []);
      const context = parseJsonField<any>(req.body.context, {});
      const draftSession = parseJsonField<DraftSessionPayload>(req.body.draftSession, {});
      const companyId = context?.companyId || context?.company_id || context?.project?.company_id || null;
      const prepared = await prepareAttachments(req.files as Express.Multer.File[] | undefined, userId);
      const grounding = await prepareSmartBuilderGrounding({
        companyId,
        message,
        currentServices,
        estimateContext: context,
        attachments: prepared.attachments,
        traceId,
      });

      const userPrompt = buildUserPrompt({
        message,
        currentServices,
        estimateContext: context,
        attachments: prepared.attachments,
        grounding,
      });

      const priorMessages = Array.isArray(draftSession.messages) ? draftSession.messages : [];
      const input = buildEstimateGenerationInput({
        priorMessages,
        userPrompt,
        contentParts: prepared.contentParts,
      });

      logSmartBuilderTrace(traceId, "messageDraft.context", {
        companyId,
        userId: userId || null,
        messageChars: message.length,
        currentServicesCount: currentServices.length,
        priorMessageCount: priorMessages.length,
        contextKeys: context && typeof context === "object" ? Object.keys(context).slice(0, 20) : [],
        attachments: prepared.attachments.map((attachment) => ({
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          hasExtractedText: Boolean(attachment.extractedText),
          extractedTextChars: attachment.extractedText?.length || 0,
        })),
        contentPartsCount: prepared.contentParts.length,
        hasDocumentAttachment: prepared.hasDocumentAttachment,
        importPricingIntent: grounding.importPricingIntent,
        allowWebSearch: grounding.allowWebSearch,
        catalogToolEnabled: false,
        serviceCatalogAvailable: grounding.serviceCatalog.length,
        catalogStats: grounding.catalogStats,
        catalogCandidatesSent: grounding.catalogCandidates.sentToModel,
        webResearchUsed: grounding.webResearch.used,
        webResearchSkippedReason: grounding.webResearch.skippedReason || null,
        input: summarizeSmartBuilderInput(input),
      });

      const response = await createStructuredEstimateResponse({
        model: prepared.hasDocumentAttachment ? DOC_MODEL : SERVICE_MODEL,
        input,
        hasDocumentAttachment: prepared.hasDocumentAttachment,
        companyId,
        allowWebSearch: grounding.allowWebSearch,
        importPricingIntent: grounding.importPricingIntent,
        traceId,
      });
      const toolUsage = (response as any).__smartBuilderToolUsage || {};

      const initialParsed = normalizeAiResponse(safeParseAiJson(getResponseText(response)), currentServices, message);
      const proposalResult = await repairSmartBuilderProposalIfNeeded({
        parsed: initialParsed,
        currentServices,
        message,
        attachments: prepared.attachments,
        importPricingIntent: grounding.importPricingIntent,
        hasDocumentAttachment: prepared.hasDocumentAttachment,
        companyId,
        traceId,
      });
      const parsed = proposalResult.parsed;
      const now = new Date().toISOString();
      const nextSession: DraftSessionPayload = {
        metadata: {
          ...(draftSession.metadata || {}),
          companyId,
          modelSimple: SERVICE_MODEL,
          modelDocument: DOC_MODEL,
          lastResponseId: response.id,
          webSearchEnabled: WEB_SEARCH_ENABLED,
          webSearchAllowedForLastRequest: grounding.allowWebSearch,
          webSearchUsedForLastRequest: Boolean(toolUsage.webSearchUsed || grounding.webResearch.used),
          catalogSearchUsedForLastRequest: false,
          lastProposalValidationPassed: proposalResult.validation.passed,
          lastProposalRepaired: proposalResult.repaired,
          lastProposalValidationErrors: proposalResult.validation.errors,
        },
        attachments: [...(draftSession.attachments || []), ...prepared.attachments],
        messages: [
          ...priorMessages,
          {
            role: "user",
            content: message,
            date_creation: now,
            attachments: prepared.attachments,
            payload: { currentServices: normalizeServices(currentServices) },
          },
          {
            role: "assistant",
            content: parsed.assistantMessage,
            payload: parsed,
            responseId: response.id,
            date_creation: now,
          },
        ],
      };

      return res.status(200).json({
        success: true,
        data: {
          assistantMessage: parsed.assistantMessage,
          proposedServices: parsed.proposedServices,
          changeSummary: parsed.changeSummary,
          warnings: parsed.warnings,
          pricingIntent: parsed.pricingIntent,
          targetTotal: parsed.targetTotal,
          proposedTotal: parsed.proposedTotal,
          targetVariance: parsed.targetVariance,
          documentPricingDetected: parsed.documentPricingDetected,
          instructionComplianceNotes: parsed.instructionComplianceNotes,
          draftSession: nextSession,
        },
      });
    } catch (error) {
      logSmartBuilderTrace(traceId, "messageDraft.error", {
        error: summarizeSmartBuilderError(error),
      }, "error");
      const smartBuilderError = getSmartBuilderErrorResponse(error);
      if (smartBuilderError) {
        return res.status(smartBuilderError.status).json(smartBuilderError.body);
      }
      return res.status(500).json({ success: false, error: "Failed to process SmartBuilder draft message" });
    }
  }

  async importSession(req: Request, res: Response) {
    const { estimateId } = req.params;
    const userId = (req as any).userId as string | undefined;
    const draftSession = parseJsonField<DraftSessionPayload>(req.body.draftSession || req.body.session, {});

    try {
      const estimate = await getEstimateContext(estimateId);
      if (!estimate) {
        return res.status(404).json({ success: false, error: "Estimate not found" });
      }

      const existing = await prisma.estimateAiSession.findUnique({ where: { estimateId } });
      if (existing) {
        return res.status(200).json({ success: true, data: { sessionId: existing.id, imported: false } });
      }

      const session = await prisma.estimateAiSession.create({
        data: {
          estimateId,
          companyId: estimate.project.company_id,
          createdById: userId || null,
          modelSimple: draftSession.metadata?.modelSimple || SERVICE_MODEL,
          modelDocument: draftSession.metadata?.modelDocument || DOC_MODEL,
          lastResponseId: draftSession.metadata?.lastResponseId || null,
          metadata: draftSession.metadata || {},
        },
      });

      for (const message of draftSession.messages || []) {
        const createdMessage = await prisma.estimateAiMessage.create({
          data: {
            sessionId: session.id,
            role: message.role,
            content: message.content || "",
            payload: message.payload || null,
            responseId: message.responseId || null,
          },
        });

        if (message.attachments?.length) {
          await prisma.estimateAiAttachment.createMany({
            data: message.attachments.map((attachment) => ({
              sessionId: session.id,
              messageId: createdMessage.id,
              fileName: attachment.fileName,
              originalName: attachment.originalName,
              mimeType: attachment.mimeType || null,
              size: attachment.size || null,
              s3Key: attachment.s3Key || null,
              extractedText: attachment.extractedText || null,
              summary: attachment.summary || null,
            })),
          });
        }
      }

      return res.status(201).json({
        success: true,
        data: { sessionId: session.id, imported: true },
      });
    } catch (error) {
      console.error("[SmartBuilderEstimate.importSession]", error);
      return res.status(500).json({ success: false, error: "Failed to import SmartBuilder session" });
    }
  }
}
