import OpenAI, { toFile } from "openai";

export type ExtractedExternalProposal = {
  subcontractorName: string | null;
  subcontractorEmail: string | null;
  proposalNumber: string | null;
  validUntil: string | null;
  notes: string | null;
  items: Array<{ name: string; description: string | null; quantity: number; unitPrice: number }>;
  confidence: number;
  warnings: string[];
};

type ExtractionWithPricing = ExtractedExternalProposal & {
  pricingBasis: {
    proposalTotal: number | null;
    unitCount: number | null;
    unitPrice: number | null;
    description: string | null;
  };
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subcontractorName: { type: ["string", "null"] },
    subcontractorEmail: { type: ["string", "null"] },
    proposalNumber: { type: ["string", "null"] },
    validUntil: { type: ["string", "null"], description: "ISO date YYYY-MM-DD when explicitly present" },
    notes: { type: ["string", "null"] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          description: { type: ["string", "null"] },
          quantity: { type: "number" },
          unitPrice: { type: "number" },
        },
        required: ["name", "description", "quantity", "unitPrice"],
      },
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    warnings: { type: "array", items: { type: "string" } },
    pricingBasis: {
      type: "object",
      additionalProperties: false,
      properties: {
        proposalTotal: { type: ["number", "null"] },
        unitCount: { type: ["number", "null"] },
        unitPrice: { type: ["number", "null"] },
        description: { type: ["string", "null"] },
      },
      required: ["proposalTotal", "unitCount", "unitPrice", "description"],
    },
  },
  required: ["subcontractorName", "subcontractorEmail", "proposalNumber", "validUntil", "notes", "items", "confidence", "warnings", "pricingBasis"],
};

const apiKey = process.env.OPENAI_KEY || process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;
const model = process.env.BID_PROPOSAL_AI_MODEL || "gpt-5.4-mini";

const extractionInstructions = [
  "Extract a subcontractor bid proposal from the attached document for an accurate apples-to-apples bid comparison.",
  "Read the entire document before deciding its commercial line items.",
  "Preserve every explicit scope, quantity, price, note, inclusion, exclusion, and validity date.",
  "Never invent missing values. Use null for missing optional metadata.",
  "pricingBasis must separately record the explicit committed proposal total, unit count, unit price, and a short description of the pricing basis.",
  "When one explicit contract price covers the complete base scope, create one base-scope item for that price; do not discard it merely because it appears in a total or contract-price section.",
  "When an explicit unit count and total are given, use the unit count as quantity and the explicit average unit price, or calculate total divided by count when the document does not state the average.",
  "Optional rates and additional-work prices must stay in notes unless the document gives a committed quantity; they must not inflate the current proposal total.",
  "Deposits, retainage, progress payments, discounts, tax, subtotals, and payment schedules are never scope items.",
  "Before responding, reconcile sum(quantity * unitPrice) for the base committed scope against every explicit contract or proposal total. Correct the items when they do not match.",
  "For a truly missing quantity use 1. For a truly missing price use 0.",
  "unitPrice must be the explicit unit price, or line total divided by an explicit non-zero quantity.",
  "Confidence is the overall extraction confidence from 0 to 1.",
  "Warnings must contain only ambiguity that can materially change the saved price or scope and requires human action. Do not warn merely because proposal number, date, validity, or optional-work quantity is absent.",
].join(" ");

const closeEnough = (left: number, right: number) => Math.abs(left - right) <= Math.max(1, Math.abs(right) * 0.005);

const normalizeExtraction = (parsed: ExtractionWithPricing): ExtractedExternalProposal => {
  let items = (Array.isArray(parsed.items) ? parsed.items : []).slice(0, 250).map((item) => ({
    name: String(item.name || "").trim(),
    description: item.description == null ? null : String(item.description).trim() || null,
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unitPrice: Number(item.unitPrice) >= 0 ? Number(item.unitPrice) : 0,
  })).filter((item) => item.name);

  const basis = parsed.pricingBasis || { proposalTotal: null, unitCount: null, unitPrice: null, description: null };
  const proposalTotal = Number(basis.proposalTotal) > 0 ? Number(basis.proposalTotal) : null;
  const unitCount = Number(basis.unitCount) > 0 ? Number(basis.unitCount) : null;
  let unitPrice = Number(basis.unitPrice) > 0 ? Number(basis.unitPrice) : null;
  if (!unitPrice && proposalTotal && unitCount) unitPrice = proposalTotal / unitCount;

  const extractedTotal = () => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (proposalTotal && unitCount && unitPrice && closeEnough(unitCount * unitPrice, proposalTotal)) {
    if (items.length === 1 || !closeEnough(extractedTotal(), proposalTotal)) {
      const base = items[0];
      items = [{
        name: base?.name || basis.description || "Base proposal scope",
        description: base?.description || basis.description,
        quantity: unitCount,
        unitPrice,
      }];
    }
  } else if (proposalTotal && !closeEnough(extractedTotal(), proposalTotal)) {
    const base = items[0];
    items = [{
      name: base?.name || basis.description || "Base proposal scope",
      description: base?.description || basis.description,
      quantity: 1,
      unitPrice: proposalTotal,
    }];
  }

  const reconciled = !proposalTotal || closeEnough(extractedTotal(), proposalTotal);
  const warnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  if (!reconciled) warnings.push("The extracted item total could not be reconciled with the document total.");

  return {
    subcontractorName: parsed.subcontractorName,
    subcontractorEmail: parsed.subcontractorEmail,
    proposalNumber: parsed.proposalNumber,
    validUntil: parsed.validUntil,
    notes: parsed.notes,
    items,
    confidence: Math.min(reconciled ? 1 : 0.7, Math.max(0, Number(parsed.confidence) || 0)),
    warnings: [...new Set(warnings)],
  };
};

export async function extractExternalProposalFromDocument(buffer: Buffer, fileName: string, contentType: string): Promise<ExtractedExternalProposal> {
  if (!openai) throw new Error("OpenAI is not configured");
  const uploaded = await openai.files.create({
    file: await toFile(buffer, fileName, { type: contentType }),
    purpose: "user_data",
  });

  try {
    const runPass = async (userText: string) => {
      const response: any = await openai.responses.create({
      model,
      instructions: extractionInstructions,
      input: [{ role: "user", content: [
        { type: "input_text", text: userText },
        { type: "input_file", file_id: uploaded.id },
      ] }],
      max_output_tokens: 5000,
      reasoning: { effort: "medium" },
      text: { format: { type: "json_schema", name: "external_bid_proposal", strict: true, schema } },
    } as any, { timeout: 120_000 } as any);
      return JSON.parse(String(response.output_text || "{}")) as ExtractionWithPricing;
    };

    const firstPass = await runPass("Extract this external estimate for review before it is saved to the Bid Request.");
    const verifiedPass = await runPass([
      "Act as a second-pass verifier. Independently read the attached document, then audit and correct this candidate extraction.",
      "Return the corrected complete extraction. Pay special attention to unit count, unit price, committed total, optional charges, deposits, and arithmetic reconciliation.",
      `Candidate extraction: ${JSON.stringify(firstPass)}`,
    ].join(" "));
    return normalizeExtraction(verifiedPass);
  } finally {
    await openai.files.delete(uploaded.id).catch(() => undefined);
  }
}
