import fs from "fs";
import { Request, Response } from "express";
import { PDFDocument } from "pdf-lib";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";
import { contractEmailTemplate } from "../../templateEmail/contract";
import {
  ContractDocumentRender,
  ContractFieldRender,
  fetchContractPdfBuffer,
  stampContractPdf,
  uploadBufferToS3,
} from "../../utils/contracts/contractPdf";

const db = prisma as any;
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const REQUIRED_FIELD_KEYS = [
  "company:signature",
  "company:signature_date",
  "client:signature",
  "client:signature_date",
];

interface ContractPayload {
  companyId?: string;
  clientId?: string;
  workContextId?: string | null;
  authType?: "none" | "code";
  authCode?: string | null;
  expirationDays?: number;
  fields?: ContractFieldInput[];
  companySignatureText?: string | null;
}

interface ContractFieldInput {
  documentId?: string;
  documentIndex?: number;
  signer: "company" | "client";
  type: "signature" | "signature_date";
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dateValue?: string | null;
}

interface UploadedContractDocument {
  originalFileName: string;
  uri: string;
  fileSize: number;
  pageCount: number;
  position: number;
}

function parsePayload(req: Request): ContractPayload {
  const rawPayload = req.body?.payload ?? req.body;
  if (!rawPayload) return {};
  if (typeof rawPayload === "string") {
    return JSON.parse(rawPayload) as ContractPayload;
  }
  return rawPayload as ContractPayload;
}

function cleanupTempFiles(files: Express.Multer.File[]) {
  for (const file of files) {
    try {
      if (file.path && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } catch (error) {
      console.error(`[contracts] Failed to delete temp file ${file.path}`, error);
    }
  }
}

function getRequestUserId(req: Request) {
  if ((req as any).userId) {
    return String((req as any).userId);
  }
  const header = req.headers["x-user-id"];
  return Array.isArray(header) ? header[0] : header;
}

function forbidden(message: string) {
  const error: any = new Error(message);
  error.statusCode = 403;
  return error;
}

function getErrorStatus(error: any, fallback: number) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : fallback;
}

async function ensureCompanyAccess(req: Request, companyId: string) {
  const userId = getRequestUserId(req);
  if (!userId) {
    throw forbidden("Authenticated user not found");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      company_id: true,
      companies: {
        select: {
          companyId: true,
        },
      },
    },
  });

  if (!user) {
    throw forbidden("Authenticated user not found");
  }

  const allowedCompanyIds = new Set<string>();
  if (user.company_id) allowedCompanyIds.add(user.company_id);
  for (const membership of user.companies || []) {
    if (membership.companyId) allowedCompanyIds.add(membership.companyId);
  }

  if (!allowedCompanyIds.has(companyId)) {
    throw forbidden("Access denied for this company");
  }
}

function isPdfFile(file: Express.Multer.File) {
  return file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
}

function validateFiles(files: Express.Multer.File[], requireFiles: boolean) {
  if (requireFiles && files.length === 0) {
    throw new Error("At least one PDF document is required");
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_UPLOAD_BYTES) {
    throw new Error("The total PDF upload size cannot exceed 20MB");
  }

  for (const file of files) {
    if (!isPdfFile(file)) {
      throw new Error("Only PDF files are allowed");
    }
  }
}

function parseEmailList(emailInput: unknown): string[] {
  if (!emailInput) return [];
  if (Array.isArray(emailInput)) {
    return emailInput.map(String).map((email) => email.trim()).filter(Boolean);
  }
  const value = String(emailInput).trim();
  if (!value) return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((email) => email.trim()).filter(Boolean);
      }
    } catch {
      return value.split(",").map((email) => email.trim()).filter(Boolean);
    }
  }
  return value.split(",").map((email) => email.trim()).filter(Boolean);
}

function normalizeExpirationDays(value: unknown) {
  const parsed = Number(value ?? 7);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error("Expiration days must be greater than zero");
  }
  return Math.floor(parsed);
}

function buildExpiresAt(expirationDays: number, baseDate = new Date()) {
  const expiresAt = new Date(baseDate);
  expiresAt.setDate(expiresAt.getDate() + expirationDays);
  return expiresAt;
}

function validateAuth(payload: ContractPayload) {
  const authType = payload.authType || "none";
  const authCode = payload.authCode?.trim() || null;

  if (!["none", "code"].includes(authType)) {
    throw new Error("Invalid authentication type");
  }

  if (authType === "code" && !/^\d{6,9}$/.test(authCode || "")) {
    throw new Error("Authentication code must contain 6 to 9 digits");
  }

  return {
    authType,
    authCode: authType === "code" ? authCode : null,
  };
}

function normalizeSignatureText(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function normalizeNumber(value: unknown, fieldName: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return parsed;
}

function normalizeFieldInput(field: ContractFieldInput, documentId: string) {
  if (!["company", "client"].includes(field.signer)) {
    throw new Error("Invalid contract field signer");
  }
  if (!["signature", "signature_date"].includes(field.type)) {
    throw new Error("Invalid contract field type");
  }

  const pageNumber = Math.floor(normalizeNumber(field.pageNumber, "page number"));
  if (pageNumber < 1) {
    throw new Error("Contract field page number must be greater than zero");
  }

  const normalized = {
    signer: field.signer,
    type: field.type,
    pageNumber,
    x: normalizeNumber(field.x, "field x"),
    y: normalizeNumber(field.y, "field y"),
    width: normalizeNumber(field.width, "field width"),
    height: normalizeNumber(field.height, "field height"),
    dateValue: field.dateValue ? new Date(field.dateValue) : null,
    documentId,
  };

  if (normalized.x < 0 || normalized.y < 0 || normalized.width <= 0 || normalized.height <= 0) {
    throw new Error("Contract field coordinates are invalid");
  }

  return normalized;
}

function validateRequiredFields(fields: Array<{ signer: string; type: string }>) {
  const present = new Set(fields.map((field) => `${field.signer}:${field.type}`));
  const missing = REQUIRED_FIELD_KEYS.filter((key) => !present.has(key));
  if (missing.length > 0) {
    throw new Error("Company and Client signature/date fields are required before saving");
  }
}

function mapFieldsToDocuments(
  fields: ContractFieldInput[] | undefined,
  documents: Array<{ id: string; position: number }>
) {
  const inputFields = fields || [];
  if (inputFields.length === 0) {
    throw new Error("Signature fields are required");
  }

  const documentsById = new Map(documents.map((document) => [document.id, document.id]));
  const documentsByIndex = new Map(documents.map((document) => [document.position, document.id]));

  const normalizedFields = inputFields.map((field) => {
    const documentId = field.documentId
      ? documentsById.get(field.documentId)
      : documentsByIndex.get(Number(field.documentIndex ?? -1));

    if (!documentId) {
      throw new Error("Contract field references an invalid document");
    }

    return normalizeFieldInput(field, documentId);
  });

  validateRequiredFields(normalizedFields);
  return normalizedFields;
}

function getEffectiveStatus(contract: any) {
  if (contract.status !== "signed" && contract.status !== "canceled" && new Date(contract.expiresAt) < new Date()) {
    return "expired";
  }
  return contract.status;
}

async function addTimeline(tx: any, contractId: string, description: string) {
  await tx.contractTimeline.create({
    data: {
      contractId,
      description,
    },
  });
}

async function getNextContractNumber(tx: any, companyId: string) {
  const sequence = await tx.contractNumberSequence.upsert({
    where: { companyId },
    create: { companyId, nextNumber: 1001 },
    update: { nextNumber: { increment: 1 } },
    select: { nextNumber: true },
  });

  return sequence.nextNumber - 1;
}

async function uploadContractDocuments(files: Express.Multer.File[], userId: string): Promise<UploadedContractDocument[]> {
  const uploaded: UploadedContractDocument[] = [];

  for (const [index, file] of files.entries()) {
    const pdfBuffer = fs.readFileSync(file.path);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const uri = await uploadFileToS3_2(file, userId || "contract");

    uploaded.push({
      originalFileName: file.originalname,
      uri,
      fileSize: file.size,
      pageCount: pdfDoc.getPageCount(),
      position: index,
    });
  }

  return uploaded;
}

async function includeDocumentUrls(document: any, signed = false) {
  const sourceUri = signed ? (document.signedUri || document.preparedUri || document.uri) : (document.preparedUri || document.uri);
  const url = sourceUri ? await getPresignedUrl(sourceUri) : null;

  return {
    ...document,
    url,
    originalUrl: document.uri ? await getPresignedUrl(document.uri) : null,
    preparedUrl: document.preparedUri ? await getPresignedUrl(document.preparedUri) : null,
    signedUrl: document.signedUri ? await getPresignedUrl(document.signedUri) : null,
  };
}

async function formatContract(contract: any, publicView = false) {
  const effectiveStatus = getEffectiveStatus(contract);
  const documents = await Promise.all(
    (contract.documents || []).map((document: any) => includeDocumentUrls(document, effectiveStatus === "signed"))
  );

  const formatted = {
    ...contract,
    status: effectiveStatus,
    effectiveStatus,
    documents,
  };

  if (publicView) {
    delete formatted.authCode;
    delete formatted.multi_emails;
    delete formatted.companySignatureText;
  }

  return formatted;
}

function contractInclude() {
  return {
    company: true,
    client: true,
    workContext: true,
    documents: {
      orderBy: { position: "asc" },
      include: {
        fields: {
          orderBy: [{ pageNumber: "asc" }, { date_creation: "asc" }],
        },
      },
    },
    fields: {
      orderBy: [{ pageNumber: "asc" }, { date_creation: "asc" }],
    },
    emailLogs: {
      orderBy: { sentAt: "desc" },
      take: 20,
    },
    timelineEvents: {
      orderBy: { date_creation: "desc" },
      take: 20,
    },
  };
}

function renderDocumentsForPdf(contract: any): ContractDocumentRender[] {
  return (contract.documents || []).map((document: any) => ({
    id: document.id,
    originalFileName: document.originalFileName,
    uri: document.uri,
    preparedUri: document.preparedUri,
    fields: (document.fields || contract.fields || []).filter((field: any) => field.documentId === document.id),
  }));
}

async function prepareContractDocuments(contractId: string, companySignatureText?: string | null) {
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: contractInclude(),
  });

  if (!contract) {
    throw new Error("Contract not found");
  }

  const documents = renderDocumentsForPdf(contract);
  const prepared: Array<{ documentId: string; buffer: Buffer; fileName: string }> = [];
  const signatureText = companySignatureText === undefined
    ? normalizeSignatureText(contract.companySignatureText)
    : normalizeSignatureText(companySignatureText);

  for (const document of documents) {
    const originalBuffer = await fetchContractPdfBuffer(document.uri);
    const stampedBuffer = await stampContractPdf(
      originalBuffer,
      document.fields,
      {
        companyName: contract.company?.name || "Company",
        companySignature: contract.company?.signature || null,
        companySignatureText: signatureText,
        clientName: contract.client?.name || "Customer",
      },
      {
        includeClientSignature: false,
        drawClientPlaceholders: true,
      }
    );

    const fileName = `contract_${contract.number}_${document.originalFileName || document.id}_prepared.pdf`;
    const preparedUri = await uploadBufferToS3(stampedBuffer, fileName);
    await db.contractDocument.update({
      where: { id: document.id },
      data: { preparedUri },
    });

    prepared.push({
      documentId: document.id,
      buffer: stampedBuffer,
      fileName: document.originalFileName || `contract_${contract.number}.pdf`,
    });
  }

  return prepared;
}

async function getPreparedDocumentsForEmail(contract: any) {
  const documents = renderDocumentsForPdf(contract);

  if (documents.some((document) => !document.preparedUri)) {
    return prepareContractDocuments(contract.id);
  }

  return Promise.all(
    documents.map(async (document) => ({
      documentId: document.id,
      buffer: await fetchContractPdfBuffer(document.preparedUri!),
      fileName: document.originalFileName || `contract_${contract.number}.pdf`,
    }))
  );
}

async function finalizeContractDocuments(
  contractId: string,
  signature: string | null,
  signedAt: Date,
  clientSignatureText?: string | null
) {
  const contract = await db.contract.findUnique({
    where: { id: contractId },
    include: contractInclude(),
  });

  if (!contract) {
    throw new Error("Contract not found");
  }

  const documents = renderDocumentsForPdf(contract);

  for (const document of documents) {
    const sourceUri = document.preparedUri || document.uri;
    const sourceBuffer = await fetchContractPdfBuffer(sourceUri);
    const fields = document.preparedUri
      ? document.fields.filter((field) => field.signer === "client")
      : document.fields;
    const stampedBuffer = await stampContractPdf(
      sourceBuffer,
      fields,
      {
        companyName: contract.company?.name || "Company",
        companySignature: contract.company?.signature || null,
        companySignatureText: normalizeSignatureText(contract.companySignatureText),
        clientName: contract.client?.name || "Customer",
        signedAt,
      },
      {
        includeClientSignature: true,
        clientSignature: signature,
        clientSignatureText: normalizeSignatureText(clientSignatureText),
        clearClientFields: Boolean(document.preparedUri),
      }
    );

    const fileName = `contract_${contract.number}_${document.originalFileName || document.id}_signed.pdf`;
    const signedUri = await uploadBufferToS3(stampedBuffer, fileName);
    await db.contractDocument.update({
      where: { id: document.id },
      data: { signedUri },
    });
  }
}

async function ensureContractDocumentArtifacts(contract: any) {
  const effectiveStatus = getEffectiveStatus(contract);
  const documents = contract.documents || [];

  if (
    effectiveStatus === "signed"
    && contract.clientSignature
    && documents.some((document: any) => !document.signedUri)
  ) {
    await finalizeContractDocuments(contract.id, contract.clientSignature, contract.signedAt || new Date());
    return db.contract.findUnique({
      where: { id: contract.id },
      include: contractInclude(),
    });
  }

  if (
    effectiveStatus !== "signed"
    && effectiveStatus !== "canceled"
    && documents.some((document: any) => !document.preparedUri)
  ) {
    await prepareContractDocuments(contract.id);
    return db.contract.findUnique({
      where: { id: contract.id },
      include: contractInclude(),
    });
  }

  return contract;
}

async function getContractByPublicToken(publicToken: string) {
  return db.contract.findUnique({
    where: { publicToken },
    include: contractInclude(),
  });
}

function validatePublicAccess(contract: any, authCode?: string) {
  if (contract.authType === "code" && contract.authCode !== authCode) {
    throw new Error("Invalid authentication code");
  }
}

function isContractExpired(contract: any) {
  return contract.status !== "signed" && contract.status !== "canceled" && new Date(contract.expiresAt) < new Date();
}

export class ContractController {
  async listByCompany(req: Request, res: Response) {
    try {
      const { companyId } = req.params;
      await ensureCompanyAccess(req, companyId);

      const search = String(req.query.search || "").trim();
      const status = String(req.query.status || "").trim();
      const searchFilters: any[] = [];

      if (search) {
        const numericSearch = Number(search);
        if (!Number.isNaN(numericSearch)) {
          searchFilters.push({ number: numericSearch });
        }
        searchFilters.push({ client: { name: { contains: search } } });
      }

      const contracts = await db.contract.findMany({
        where: {
          companyId,
          ...(status && status !== "all" ? { status } : {}),
          ...(searchFilters.length > 0 ? { OR: searchFilters } : {}),
        },
        include: {
          client: true,
          workContext: true,
          documents: { orderBy: { position: "asc" } },
        },
        orderBy: { date_creation: "desc" },
      });

      return res.json(await Promise.all(contracts.map((contract: any) => formatContract(contract))));
    } catch (error: any) {
      console.error("[contracts.listByCompany]", error);
      return res.status(getErrorStatus(error, 500)).json({ error: error.message || "Failed to list contracts" });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const contract = await db.contract.findUnique({
        where: { id: req.params.id },
        include: contractInclude(),
      });

      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      await ensureCompanyAccess(req, contract.companyId);

      const latestContract = await ensureContractDocumentArtifacts(contract);
      return res.json(await formatContract(latestContract));
    } catch (error: any) {
      console.error("[contracts.getById]", error);
      return res.status(getErrorStatus(error, 500)).json({ error: error.message || "Failed to load contract" });
    }
  }

  async create(req: Request, res: Response) {
    const files = (req.files as Express.Multer.File[]) || [];

    try {
      validateFiles(files, true);
      const payload = parsePayload(req);
      const { authType, authCode } = validateAuth(payload);

      if (!payload.companyId || !payload.clientId) {
        throw new Error("Company and client are required");
      }

      await ensureCompanyAccess(req, payload.companyId);

      const expirationDays = normalizeExpirationDays(payload.expirationDays);
      const companySignatureText = normalizeSignatureText(payload.companySignatureText);
      const uploadedDocuments = await uploadContractDocuments(files, getRequestUserId(req) || payload.companyId);

      const contract = await db.$transaction(async (tx: any) => {
        const number = await getNextContractNumber(tx, payload.companyId!);
        const created = await tx.contract.create({
          data: {
            number,
            companyId: payload.companyId,
            clientId: payload.clientId,
            workContextId: payload.workContextId || null,
            authType,
            authCode,
            expirationDays,
            expiresAt: buildExpiresAt(expirationDays),
            createdById: getRequestUserId(req) || null,
            companySignatureText,
          },
        });

        for (const document of uploadedDocuments) {
          await tx.contractDocument.create({
            data: {
              ...document,
              contractId: created.id,
            },
          });
        }

        const documents = await tx.contractDocument.findMany({
          where: { contractId: created.id },
          select: { id: true, position: true },
        });
        const fields = mapFieldsToDocuments(payload.fields, documents);

        await tx.contractField.createMany({
          data: fields.map((field) => ({
            ...field,
            contractId: created.id,
          })),
        });

        await addTimeline(tx, created.id, "Contract created");
        return created;
      });

      await prepareContractDocuments(contract.id);

      const createdContract = await db.contract.findUnique({
        where: { id: contract.id },
        include: contractInclude(),
      });

      cleanupTempFiles(files);
      return res.status(201).json(await formatContract(createdContract));
    } catch (error: any) {
      cleanupTempFiles(files);
      console.error("[contracts.create]", error);
      return res.status(getErrorStatus(error, 400)).json({ error: error.message || "Failed to create contract" });
    }
  }

  async update(req: Request, res: Response) {
    const files = (req.files as Express.Multer.File[]) || [];

    try {
      validateFiles(files, false);
      const payload = parsePayload(req);
      const existing = await db.contract.findUnique({
        where: { id: req.params.id },
        include: contractInclude(),
      });

      if (!existing) {
        return res.status(404).json({ error: "Contract not found" });
      }

      if (existing.status === "signed" || existing.status === "canceled") {
        return res.status(400).json({ error: "Signed or canceled contracts cannot be edited" });
      }

      await ensureCompanyAccess(req, existing.companyId);

      const { authType, authCode } = validateAuth({
        authType: payload.authType ?? existing.authType,
        authCode: payload.authCode ?? existing.authCode,
      });
      const expirationDays = normalizeExpirationDays(payload.expirationDays ?? existing.expirationDays);
      const uploadedDocuments = files.length > 0
        ? await uploadContractDocuments(files, getRequestUserId(req) || existing.companyId)
        : [];
      const hasCompanySignatureText = Object.prototype.hasOwnProperty.call(payload, "companySignatureText");
      const companySignatureText = hasCompanySignatureText
        ? normalizeSignatureText(payload.companySignatureText)
        : normalizeSignatureText(existing.companySignatureText);

      await db.$transaction(async (tx: any) => {
        await tx.contract.update({
          where: { id: existing.id },
          data: {
            clientId: payload.clientId || existing.clientId,
            workContextId: payload.workContextId === undefined ? existing.workContextId : payload.workContextId,
            authType,
            authCode,
            expirationDays,
            expiresAt: buildExpiresAt(expirationDays, existing.date_creation),
            status: existing.status === "expired" ? "draft" : existing.status,
            companySignatureText,
          },
        });

        if (uploadedDocuments.length > 0) {
          await tx.contractDocument.deleteMany({ where: { contractId: existing.id } });
          for (const document of uploadedDocuments) {
            await tx.contractDocument.create({
              data: {
                ...document,
                contractId: existing.id,
              },
            });
          }
        }

        if (uploadedDocuments.length > 0 || payload.fields) {
          const documents = await tx.contractDocument.findMany({
            where: { contractId: existing.id },
            select: { id: true, position: true },
          });
          const fields = mapFieldsToDocuments(payload.fields, documents);
          await tx.contractField.deleteMany({ where: { contractId: existing.id } });
          await tx.contractField.createMany({
            data: fields.map((field) => ({
              ...field,
              contractId: existing.id,
            })),
          });
        }

        await addTimeline(tx, existing.id, "Contract updated");
      });

      await prepareContractDocuments(existing.id);

      const updated = await db.contract.findUnique({
        where: { id: existing.id },
        include: contractInclude(),
      });

      cleanupTempFiles(files);
      return res.json(await formatContract(updated));
    } catch (error: any) {
      cleanupTempFiles(files);
      console.error("[contracts.update]", error);
      return res.status(getErrorStatus(error, 400)).json({ error: error.message || "Failed to update contract" });
    }
  }

  async send(req: Request, res: Response) {
    return this.sendContract(req, res, false);
  }

  async reminder(req: Request, res: Response) {
    return this.sendContract(req, res, true);
  }

  private async sendContract(req: Request, res: Response, isReminder: boolean) {
    const files = (req.files as Express.Multer.File[]) || [];

    try {
      const contract = await db.contract.findUnique({
        where: { id: req.params.id },
        include: contractInclude(),
      });

      if (!contract) {
        cleanupTempFiles(files);
        return res.status(404).json({ error: "Contract not found" });
      }

      await ensureCompanyAccess(req, contract.companyId);

      if (contract.status === "signed" || contract.status === "canceled" || isContractExpired(contract)) {
        cleanupTempFiles(files);
        return res.status(400).json({ error: "This contract cannot be sent" });
      }

      validateRequiredFields(contract.fields || []);

      const to = parseEmailList(req.body.to);
      const cc = parseEmailList(req.body.cc);
      const bcc = parseEmailList(req.body.bcc);
      const from = String(req.body.from || "");
      const sendMeCopy = req.body.sendMeCopy === "true" || req.body.sendMeCopy === true;
      const allRecipients = [...to, ...cc, ...bcc, ...(sendMeCopy && from ? [from] : [])];
      const uniqueRecipients = [...new Set(allRecipients.filter(Boolean))];

      if (to.length === 0) {
        cleanupTempFiles(files);
        return res.status(400).json({ error: "Recipient email is required" });
      }

      const preparedDocuments = await getPreparedDocumentsForEmail(contract);
      const attachments = preparedDocuments.map((document) => ({
        filename: document.fileName,
        content: document.buffer.toString("base64"),
        type: "application/pdf",
        disposition: "attachment",
      }));

      for (const file of files) {
        const fileBuffer = fs.readFileSync(file.path);
        attachments.push({
          filename: file.originalname,
          content: fileBuffer.toString("base64"),
          type: file.mimetype,
          disposition: "attachment",
        });
      }

      const companyAvatar = contract.company?.avatar ? await getPresignedUrl(contract.company.avatar) : "";
      const reviewLink = `${process.env.URL_FRONT}/contract-response/${contract.publicToken}`;
      const subject = String(req.body.subject || `${contract.company?.name || "SmartBuild"} - Contract #${contract.number}`);
      const body = String(req.body.body || "");
      const results: Array<{ email: string; status: "success" | "error"; message?: string }> = [];

      for (const recipient of uniqueRecipients) {
        try {
          await sendEmail({
            to: recipient,
            subject,
            companyId: contract.companyId,
            html: contractEmailTemplate({
              companyName: contract.company?.name || "SmartBuild",
              companyAvatar,
              clientName: contract.workContext?.Name || contract.client?.name || "Customer",
              contractNumber: contract.number,
              reviewLink,
              authCode: contract.authType === "code" ? contract.authCode : null,
              body,
            }),
            attachments,
            throwOnError: true,
          });

          await db.contractEmailLog.create({
            data: {
              contractId: contract.id,
              recipient,
              status: "success",
            },
          });
          results.push({ email: recipient, status: "success" });
        } catch (error: any) {
          await db.contractEmailLog.create({
            data: {
              contractId: contract.id,
              recipient,
              status: "error",
              errorMessage: error.message || "Unknown error",
            },
          });
          results.push({ email: recipient, status: "error", message: error.message });
        }
      }

      if (results.some((result) => result.status === "success")) {
        await db.contract.update({
          where: { id: contract.id },
          data: {
            status: "sent",
            sentAt: new Date(),
            multi_emails: JSON.stringify(uniqueRecipients),
          },
        });
        await addTimeline(db, contract.id, isReminder ? `Reminder sent to ${uniqueRecipients.join(", ")}` : `Contract sent to ${uniqueRecipients.join(", ")}`);
      }

      cleanupTempFiles(files);
      return res.json({
        success: results.some((result) => result.status === "success"),
        results,
      });
    } catch (error: any) {
      cleanupTempFiles(files);
      console.error("[contracts.send]", error);
      return res.status(getErrorStatus(error, 500)).json({ error: error.message || "Failed to send contract" });
    }
  }

  async cancel(req: Request, res: Response) {
    try {
      const contract = await db.contract.findUnique({ where: { id: req.params.id } });
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      await ensureCompanyAccess(req, contract.companyId);

      if (contract.status === "signed") {
        return res.status(400).json({ error: "Signed contracts cannot be canceled" });
      }

      const updated = await db.contract.update({
        where: { id: contract.id },
        data: {
          status: "canceled",
          canceledAt: new Date(),
        },
        include: contractInclude(),
      });

      await addTimeline(db, contract.id, "Contract canceled");
      return res.json(await formatContract(updated));
    } catch (error: any) {
      console.error("[contracts.cancel]", error);
      return res.status(getErrorStatus(error, 500)).json({ error: error.message || "Failed to cancel contract" });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const contract = await db.contract.findUnique({ where: { id: req.params.id } });
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      await ensureCompanyAccess(req, contract.companyId);

      if (contract.status === "signed" || contract.signedAt || contract.clientSignature) {
        return res.status(400).json({ error: "Signed contracts cannot be deleted" });
      }

      await db.contract.delete({ where: { id: contract.id } });
      return res.json({ success: true });
    } catch (error: any) {
      console.error("[contracts.delete]", error);
      return res.status(getErrorStatus(error, 500)).json({ error: error.message || "Failed to delete contract" });
    }
  }

  async getPublic(req: Request, res: Response) {
    try {
      const contract = await getContractByPublicToken(req.params.publicToken);
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      const queryCode = typeof req.query.code === "string" ? req.query.code : undefined;
      if (contract.authType === "code" && contract.authCode !== queryCode) {
        return res.json({
          requiresAuth: true,
          contract: {
            number: contract.number,
            status: getEffectiveStatus(contract),
            expiresAt: contract.expiresAt,
            company: {
              name: contract.company?.name,
              avatar: contract.company?.avatar ? await getPresignedUrl(contract.company.avatar) : null,
            },
          },
        });
      }

      let latestContract = contract;
      if (contract.status === "sent" && !isContractExpired(contract)) {
        latestContract = await db.contract.update({
          where: { id: contract.id },
          data: {
            status: "viewed",
            viewedAt: contract.viewedAt || new Date(),
          },
          include: contractInclude(),
        });
      }

      await addTimeline(db, contract.id, "Contract viewed");
      latestContract = await ensureContractDocumentArtifacts(latestContract);

      return res.json({
        requiresAuth: false,
        contract: await formatContract(latestContract, true),
      });
    } catch (error) {
      console.error("[contracts.getPublic]", error);
      return res.status(500).json({ error: "Failed to load contract" });
    }
  }

  async verifyCode(req: Request, res: Response) {
    try {
      const contract = await getContractByPublicToken(req.params.publicToken);
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      validatePublicAccess(contract, String(req.body.authCode || ""));

      let latestContract = contract;
      if (contract.status === "sent" && !isContractExpired(contract)) {
        latestContract = await db.contract.update({
          where: { id: contract.id },
          data: {
            status: "viewed",
            viewedAt: contract.viewedAt || new Date(),
          },
          include: contractInclude(),
        });
      }

      await addTimeline(db, contract.id, "Contract viewed");
      latestContract = await ensureContractDocumentArtifacts(latestContract);

      return res.json({
        requiresAuth: false,
        contract: await formatContract(latestContract, true),
      });
    } catch (error: any) {
      console.error("[contracts.verifyCode]", error);
      return res.status(401).json({ error: error.message || "Invalid authentication code" });
    }
  }

  async signPublic(req: Request, res: Response) {
    try {
      const contract = await getContractByPublicToken(req.params.publicToken);
      if (!contract) {
        return res.status(404).json({ error: "Contract not found" });
      }

      validatePublicAccess(contract, req.body.authCode ? String(req.body.authCode) : undefined);

      if (contract.status === "signed") {
        return res.status(400).json({ error: "Contract is already signed" });
      }
      if (contract.status === "canceled") {
        return res.status(400).json({ error: "Contract is canceled" });
      }
      if (isContractExpired(contract)) {
        return res.status(400).json({ error: "Contract link has expired" });
      }

      const signature = String(req.body.signature || "");
      const clientSignatureText = normalizeSignatureText(req.body.clientSignatureText);
      const shouldUseTypedSignature = Boolean(clientSignatureText);

      if (!shouldUseTypedSignature && !signature.startsWith("data:image/")) {
        return res.status(400).json({ error: "Signature is required" });
      }

      const signedAt = new Date();
      await finalizeContractDocuments(contract.id, shouldUseTypedSignature ? null : signature, signedAt, clientSignatureText);

      const updated = await db.contract.update({
        where: { id: contract.id },
        data: {
          status: "signed",
          signedAt,
          clientSignature: shouldUseTypedSignature ? null : signature,
        },
        include: contractInclude(),
      });

      await addTimeline(db, contract.id, "Contract signed by client");
      return res.json({
        success: true,
        contract: await formatContract(updated, true),
      });
    } catch (error: any) {
      console.error("[contracts.signPublic]", error);
      return res.status(400).json({ error: error.message || "Failed to sign contract" });
    }
  }
}
