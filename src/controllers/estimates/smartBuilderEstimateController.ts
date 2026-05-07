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

const openai = (process.env.OPENAI_KEY || process.env.OPENAI_API_KEY)
  ? new OpenAI({ apiKey: process.env.OPENAI_KEY || process.env.OPENAI_API_KEY })
  : null;

const SERVICE_MODEL = process.env.SMARTBUILDER_SERVICE_MODEL || "gpt-5-mini";
const DOC_MODEL = process.env.SMARTBUILDER_DOC_MODEL || "gpt-5.2";
const WEB_SEARCH_ENABLED = String(process.env.SMARTBUILDER_WEB_SEARCH_ENABLED || "").toLowerCase() === "true";
const WEB_SEARCH_TOOL_TYPE = process.env.SMARTBUILDER_WEB_SEARCH_TOOL_TYPE || "web_search";
const HISTORY_LIMIT = 30;
const MAX_TEXT_ATTACHMENT_CHARS = 16_000;
const MAX_CATALOG_SERVICES = 250;

const SMARTBUILDER_SYSTEM_PROMPT = `
You are SmartBuilder AI for Pro SmartBuild estimates.
Your only scope in this version is estimate Line Items/services.
Always treat the currentServices passed in the latest request as the source of truth, even when prior chat history says something different.
Return a complete proposedServices list, not a partial patch, so the user can review before applying.
Preserve existing service ids when modifying existing services. Use null id for new services.

Language and writing standards:
- Always write service names, notes, assistant messages, and descriptions in professional American English.
- Service descriptions must be specific and construction-ready, not vague. Use safe simple HTML.
- Prefer structured descriptions with sections such as Scope of Work, Preparation, Materials, Execution, Finish/Cleanup, Quality Standards, Assumptions, and Exclusions when applicable.
- Include measurable details from the user request, attachments, location, and current services whenever available.

Pricing standards for the United States:
- Use the company service catalog as the primary pricing anchor when it matches the requested work.
- Respect catalog fixedPrice, minPrice, and maxPrice as anchors; do not inflate above those anchors without clear project-specific evidence.
- Estimate realistic US-market labor/material pricing. Avoid premium padding, large contingency, or extra margin unless explicitly requested or clearly justified by the job conditions.
- Do not aggressively round prices to "nice" tens, hundreds, or thousands. Values may include cents and decimals.
- unitPrice and lineTotal are money fields. Preserve cents when supplied by a document or calculation.
- If calculating a line total, quantity * unitPrice should be rounded only to normal currency precision, never to a visually pleasing number.

Source priority:
- If the user asks to estimate/create from scratch, use current services, company catalog, provided context, attachments, and controlled web search only when needed.
- If the user attaches an existing estimate, proposal, quote, bid, invoice, spreadsheet, or budget and asks to copy/import/replicate/use it, preserve the services, quantities, unit prices, and totals from the file as faithfully as possible.
- When explicit prices exist in an attached document for an import/copy request, do not reprice from the catalog, do not replace with web search values, and do not round them.
- If an attached document has ambiguous rows or missing values, preserve what is clear and add a warning only for the unclear critical items.

Web search:
- Use web search only when catalog/context/attachments are insufficient to price or describe unfamiliar US construction services.
- Do not use web search to override explicit prices from an attached estimate/proposal/bid/quote when the user is asking to import or copy.

Do not change taxes, discounts, project status, signatures, invoices, clients, payments, schedules, or PDFs.
Warnings should be reserved for critical missing or ambiguous information that affects the proposal. Do not add generic warnings just to justify normal estimating uncertainty.
`;

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
  },
  required: ["assistantMessage", "proposedServices", "changeSummary", "warnings"],
};

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

function normalizeAiResponse(raw: any, fallbackServices: SmartBuilderService[]) {
  const fallback = {
    assistantMessage: "I prepared a line item proposal for review.",
    proposedServices: normalizeServices(fallbackServices),
    changeSummary: [],
    warnings: ["The AI response could not be fully parsed, so the current services were preserved."],
  };

  if (!raw || typeof raw !== "object") return fallback;

  return {
    assistantMessage: typeof raw.assistantMessage === "string" ? raw.assistantMessage : fallback.assistantMessage,
    proposedServices: normalizeServices(Array.isArray(raw.proposedServices) ? raw.proposedServices : fallbackServices),
    changeSummary: Array.isArray(raw.changeSummary) ? raw.changeSummary.map(String) : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String) : [],
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

async function buildServiceCatalog(companyId?: string | null) {
  if (!companyId) return [];

  const categories = await prisma.category.findMany({
    where: {
      company_id: companyId,
      status_category: {
        not: false,
      },
    },
    select: {
      category_name: true,
      sub_category: {
        where: {
          status_subcategory: {
            not: false,
          },
        },
        select: {
          subcategory_name: true,
          service: {
            take: MAX_CATALOG_SERVICES,
            orderBy: { date_creation: "asc" },
            select: {
              id: true,
              service_name: true,
              description: true,
              price_type: true,
              price_fixe: true,
              price_minimum: true,
              price_maximum: true,
            },
          },
        },
      },
    },
    orderBy: { date_creation: "asc" },
    take: 80,
  });

  const services: any[] = [];
  for (const category of categories) {
    for (const subCategory of category.sub_category) {
      for (const service of subCategory.service) {
        if (services.length >= MAX_CATALOG_SERVICES) return services;
        services.push({
          id: service.id,
          category: category.category_name,
          subcategory: subCategory.subcategory_name,
          name: service.service_name,
          description: service.description,
          priceType: service.price_type,
          fixedPrice: decimalToNumber(service.price_fixe, 0),
          minPrice: decimalToNumber(service.price_minimum, 0),
          maxPrice: decimalToNumber(service.price_maximum, 0),
        });
      }
    }
  }

  return services;
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
        orderBy: { date_creation: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          id_service: true,
          notes: true,
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
  serviceCatalog: any[];
  attachments: SmartBuilderAttachment[];
}) {
  const attachmentText = params.attachments
    .filter((attachment) => attachment.extractedText)
    .map((attachment) => `Attachment ${attachment.originalName} extracted text:\n${attachment.extractedText}`)
    .join("\n\n");

  return JSON.stringify({
    userRequest: params.message,
    currentServices: normalizeServices(params.currentServices),
    estimate: params.estimateContext,
    companyServiceCatalog: params.serviceCatalog,
    attachmentMetadata: params.attachments.map((attachment) => ({
      fileName: attachment.originalName,
      mimeType: attachment.mimeType || null,
      size: attachment.size || null,
      hasExtractedText: Boolean(attachment.extractedText),
    })),
    extractedAttachmentText: attachmentText || null,
    operatingModeRules: {
      importOrCopyAttachedEstimate: {
        triggerExamples: [
          "copy this estimate",
          "import this proposal",
          "replicate this bid",
          "use the same prices",
          "transform this quote into services",
          "copiar esse orcamento",
          "usar os valores do arquivo",
        ],
        rule: "When this applies, preserve service names, quantities, unit prices, and totals from the attachment. Do not reprice, do not replace with catalog/web, and do not round to nicer numbers.",
      },
      estimateFromScratch: {
        rule: "When no explicit imported pricing is requested, estimate conservatively for the United States using current services, project context, company catalog anchors, and web search only if needed.",
      },
    },
    descriptionRequirements: {
      language: "American English",
      html: "Use simple safe HTML only, such as paragraphs, strong labels, and unordered lists.",
      detailLevel: "Professional, specific, and complete enough for a client-facing construction estimate.",
      includeWhenApplicable: [
        "Scope of Work",
        "Preparation",
        "Materials",
        "Execution",
        "Finish and cleanup",
        "Quality standards",
        "Assumptions",
        "Exclusions",
      ],
      avoid: ["generic one-line descriptions", "vague language", "Portuguese service names or descriptions"],
    },
    pricingRequirements: {
      market: "United States",
      priority: [
        "Explicit attached estimate/proposal/bid prices when user asks to copy/import",
        "Company catalog fixedPrice/minPrice/maxPrice for matching services",
        "Current estimate service prices if user is editing existing work",
        "Conservative US-market estimate from context",
        "Web search only when the above sources are insufficient",
      ],
      preserveDecimals: true,
      allowCents: true,
      maxCurrencyDecimals: 2,
      avoidAggressiveRounding: true,
      avoidInflation: "Do not add premium padding, high contingency, or extra markup without clear evidence or user instruction.",
    },
    webSearchPolicy: {
      enabled: WEB_SEARCH_ENABLED,
      useOnlyWhenNeeded: true,
      userLocationCountry: "US",
      neverOverrideExplicitAttachmentPrices: true,
    },
    responseInstruction: "Return only the JSON object requested by the schema.",
  });
}

function buildSmartBuilderResponseRequest(model: string, input: any[]) {
  return {
    model,
    instructions: SMARTBUILDER_SYSTEM_PROMPT,
    input,
    text: {
      format: {
        type: "json_schema",
        name: "estimate_smartbuilder_response",
        strict: true,
        schema: smartBuilderJsonSchema,
      },
    },
  };
}

function buildWebSearchOptions() {
  if (!WEB_SEARCH_ENABLED) return {};

  return {
    tools: [
      {
        type: WEB_SEARCH_TOOL_TYPE,
        user_location: {
          type: "approximate",
          country: "US",
        },
      },
    ],
    tool_choice: "auto",
  };
}

async function createSmartBuilderResponse(params: { model: string; input: any[] }) {
  if (!openai) {
    throw new Error("OpenAI API key is not configured");
  }

  const baseRequest = buildSmartBuilderResponseRequest(params.model, params.input);

  if (!WEB_SEARCH_ENABLED) {
    return openai.responses.create(baseRequest as any);
  }

  try {
    return await openai.responses.create({
      ...baseRequest,
      ...buildWebSearchOptions(),
    } as any);
  } catch (error) {
    console.error("[SmartBuilderEstimate.webSearchFallback]", error);
    return openai.responses.create(baseRequest as any);
  }
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

      const serviceCatalog = await buildServiceCatalog(estimate.project.company_id);
      const session = await getOrCreateSession(estimateId, estimate.project.company_id, userId);
      const prepared = await prepareAttachments(req.files as Express.Multer.File[] | undefined, userId);
      const userPrompt = buildUserPrompt({
        message,
        currentServices,
        estimateContext: {
          id: estimate.id,
          number: estimate.number,
          status: estimate.status,
          type: estimate.type_estimate,
          project: estimate.project,
        },
        serviceCatalog,
        attachments: prepared.attachments,
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

      const input = [
        ...compactMessages((session.messages || []) as any),
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            ...prepared.contentParts,
          ],
        },
      ];

      const response = await createSmartBuilderResponse({
        model: prepared.hasDocumentAttachment ? DOC_MODEL : SERVICE_MODEL,
        input,
      });

      const rawText = getResponseText(response);
      const parsed = normalizeAiResponse(safeParseAiJson(rawText), currentServices);

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
      console.error("[SmartBuilderEstimate.messageExisting]", error);
      return res.status(500).json({ success: false, error: "Failed to process SmartBuilder message" });
    }
  }

  async messageDraft(req: Request, res: Response) {
    const userId = (req as any).userId as string | undefined;

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
      const serviceCatalog = await buildServiceCatalog(companyId);
      const prepared = await prepareAttachments(req.files as Express.Multer.File[] | undefined, userId);

      const userPrompt = buildUserPrompt({
        message,
        currentServices,
        estimateContext: context,
        serviceCatalog,
        attachments: prepared.attachments,
      });

      const priorMessages = Array.isArray(draftSession.messages) ? draftSession.messages : [];
      const input = [
        ...compactMessages(priorMessages),
        {
          role: "user",
          content: [
            { type: "input_text", text: userPrompt },
            ...prepared.contentParts,
          ],
        },
      ];

      const response = await createSmartBuilderResponse({
        model: prepared.hasDocumentAttachment ? DOC_MODEL : SERVICE_MODEL,
        input,
      });

      const parsed = normalizeAiResponse(safeParseAiJson(getResponseText(response)), currentServices);
      const now = new Date().toISOString();
      const nextSession: DraftSessionPayload = {
        metadata: {
          ...(draftSession.metadata || {}),
          companyId,
          modelSimple: SERVICE_MODEL,
          modelDocument: DOC_MODEL,
          lastResponseId: response.id,
          webSearchEnabled: WEB_SEARCH_ENABLED,
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
          draftSession: nextSession,
        },
      });
    } catch (error) {
      console.error("[SmartBuilderEstimate.messageDraft]", error);
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
