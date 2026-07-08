import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import crypto from "crypto";
import fs from "fs";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import { buildEstimateFinancialFields } from "../../utils/estimateDiscount";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";
import { addCompanySignatureImageToPdfBuffer, addCompanySignatureToPdfBuffer } from "../../utils/pdfEstimateSignatures";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";
import {
  deleteS3ObjectQuietly,
  getStagedObjectBuffer,
  putS3ObjectBuffer,
  StagedUploadReference,
  verifyStagedUploadReference,
} from "../../utils/S3/stagedUpload";

type CreateFullEstimateForProjectPayload = {
  pdf?: {
    type_pdf?: string;
    templateNumber?: number | string;
    upload?: StagedUploadReference;
  };
  estimate: {
    preGeneratedNumber: string;
    totalAmount: number;
    amountPaid?: number;
    markupType?: "fixed" | "percentage" | null;
    markupValue?: number | null;
    discountType?: "fixed" | "percentage" | null;
    discountValue?: number | null;
    depositType?: "fixed" | "percentage" | null;
    depositValue?: number | null;
    description?: string;
    terms?: string;
    status?: string;
    type_estimate: "estimate" | "estimateProject";
    multi_emails?: string;
    date_creation?: string;
    workContextId?: string | null;
    cancelEstimates?: boolean;
    isProjectFlow?: boolean;
    isStandaloneEstimate?: boolean;
  };
  services: Array<{
    name: string;
    description?: string | null;
    quantity?: number | null;
    unitPrice?: number | null;
    lineTotal?: number | null;
    originalUnitPrice?: number | null;
    originalLineTotal?: number | null;
    notes?: string | null;
    id_service?: string | null;
    hours?: number | null;
    price?: number | null;
    start_date?: string | null;
    deadline?: string | null;
    pos?: number | null;
  }>;
  attachments?: Array<{
    title?: string | null;
    type_images_attachments?: "image" | "document";
    upload?: StagedUploadReference;
  }>;
  smartBuilderSession?: {
    metadata?: any;
    messages?: Array<{
      role: string;
      content?: string;
      payload?: any;
      responseId?: string | null;
      attachments?: Array<{
        fileName: string;
        originalName: string;
        mimeType?: string | null;
        size?: number | null;
        s3Key?: string | null;
        extractedText?: string | null;
        summary?: string | null;
      }>;
    }>;
  } | null;
};

type MulterRequest = Request & {
  files?: {
    file?: Express.Multer.File[];
    attachments?: Express.Multer.File[];
  };
};

const DISCOUNT_ERRORS = new Set([
  "Invalid discount type",
  "Invalid markup type",
  "Invalid deposit type",
  "Percentage markup cannot be greater than 100",
  "Percentage discount cannot be greater than 100",
  "Fixed discount cannot be greater than estimate subtotal",
  "Percentage deposit cannot be greater than 100",
  "Fixed deposit cannot be greater than estimate total",
]);

const VALIDATION_ERRORS = new Set([
  "payload is required",
  "payload must be valid JSON",
  "PDF file is required",
  "Only PDF files are allowed",
  "Staged upload reference is required",
  "Staged upload token expired",
  "Staged upload reference does not match request",
  "Staged upload size does not match",
  "Staged upload content type does not match",
  "Invalid staged upload token",
  "projectId is required",
  "Project not found",
  "Project company is required",
  "preGeneratedNumber is required",
  "totalAmount is required",
  "type_estimate is required",
  "services are required",
  "service name is required",
  "date_creation must be a valid date",
]);

const parsePayload = (rawPayload: unknown): CreateFullEstimateForProjectPayload => {
  if (!rawPayload || typeof rawPayload !== "string") {
    throw new Error("payload is required");
  }

  try {
    return JSON.parse(rawPayload);
  } catch {
    throw new Error("payload must be valid JSON");
  }
};

const validatePayload = (projectId: string | undefined, payload: CreateFullEstimateForProjectPayload) => {
  if (!projectId) throw new Error("projectId is required");
  if (!payload.estimate?.preGeneratedNumber) throw new Error("preGeneratedNumber is required");
  if (payload.estimate.totalAmount === undefined || payload.estimate.totalAmount === null) {
    throw new Error("totalAmount is required");
  }
  if (!payload.estimate.type_estimate) throw new Error("type_estimate is required");
  if (!payload.services?.length) throw new Error("services are required");

  for (const service of payload.services) {
    if (!service.name) throw new Error("service name is required");
  }
};

const parseOptionalDate = (value: string | null | undefined, fieldName: string) => {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid date`);
  }
  return date;
};

const removeLocalFiles = async (files: Express.Multer.File[]) => {
  await Promise.all(files.map((file) => deleteFile(file.path)));
};

const deleteS3File = async (fileName?: string | null) => {
  if (!fileName) return;

  try {
    const s3 = new S3Client({
      region: process.env.AMAZON_S3_REGION,
      credentials: {
        accessKeyId: process.env.AMAZON_S3_KEY!,
        secretAccessKey: process.env.AMAZON_S3_SECRET!,
      },
    });

    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.AMAZON_S3_BUCKET!,
      Key: fileName,
    }));
  } catch (error) {
    console.error("[CreateFullEstimateForProjectController] Failed to cleanup uploaded file:", error);
  }
};

const signPdfBuffer = async (pdfBuffer: Buffer, company?: { name?: string | null; signature?: string | null }) => {
  const companyName = company?.name || "Company";
  try {
    return company?.signature
      ? await addCompanySignatureImageToPdfBuffer(pdfBuffer, company.signature, companyName)
      : await addCompanySignatureToPdfBuffer(pdfBuffer, companyName, new Date());
  } catch (error) {
    console.error("[CreateFullEstimateForProjectController] Error adding company signature to PDF:", error);
    return pdfBuffer;
  }
};

const buildFinalPdfFileName = (originalName: string) => {
  const fileHash = crypto.randomBytes(4).toString("hex");
  return `${fileHash}-${originalName.replace(/\s/g, "")}`;
};

const uploadSignedPdfBuffer = async (
  pdfBuffer: Buffer,
  originalName: string,
  company?: { name?: string | null; signature?: string | null }
) => {
  if (!originalName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are allowed");
  }

  const pdfToUpload = await signPdfBuffer(pdfBuffer, company);
  const fileName = buildFinalPdfFileName(originalName);
  const s3 = new S3Client({
    region: process.env.AMAZON_S3_REGION,
    credentials: {
      accessKeyId: process.env.AMAZON_S3_KEY!,
      secretAccessKey: process.env.AMAZON_S3_SECRET!,
    },
  });

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AMAZON_S3_BUCKET!,
    Key: fileName,
    Body: pdfToUpload,
    ContentType: "application/pdf",
  }));

  return fileName;
};

const uploadSignedPdf = async (file: Express.Multer.File, company?: { name?: string | null; signature?: string | null }) => {
  const pdfBuffer = await fs.promises.readFile(file.path);
  const fileName = await uploadSignedPdfBuffer(pdfBuffer, file.originalname, company);
  await deleteFile(file.path);
  return fileName;
};

const uploadSignedStagedPdf = async (
  upload: StagedUploadReference,
  params: { companyId: string; userId: string },
  company?: { name?: string | null; signature?: string | null }
) => {
  await verifyStagedUploadReference(upload, {
    companyId: params.companyId,
    userId: params.userId,
    purpose: "estimate-pdf",
  });

  const pdfBuffer = await getStagedObjectBuffer(upload.key);
  const fileName = buildFinalPdfFileName(upload.originalName || "estimate.pdf");
  const signedPdfBuffer = await signPdfBuffer(pdfBuffer, company);
  await putS3ObjectBuffer({ key: fileName, body: signedPdfBuffer, contentType: "application/pdf" });
  await deleteS3ObjectQuietly(upload.key);
  return fileName;
};

const importSmartBuilderSession = async (
  tx: Prisma.TransactionClient,
  estimateId: string,
  companyId: string | null | undefined,
  userId: string | undefined,
  draftSession?: CreateFullEstimateForProjectPayload["smartBuilderSession"]
) => {
  if (!draftSession?.messages?.length) return null;

  const existing = await tx.estimateAiSession.findUnique({ where: { estimateId } });
  if (existing) return existing;

  const session = await tx.estimateAiSession.create({
    data: {
      estimateId,
      companyId: companyId || null,
      createdById: userId || null,
      modelSimple: draftSession.metadata?.modelSimple || null,
      modelDocument: draftSession.metadata?.modelDocument || null,
      lastResponseId: draftSession.metadata?.lastResponseId || null,
      metadata: draftSession.metadata || {},
    },
  });

  for (const message of draftSession.messages || []) {
    const createdMessage = await tx.estimateAiMessage.create({
      data: {
        sessionId: session.id,
        role: message.role,
        content: message.content || "",
        payload: message.payload || null,
        responseId: message.responseId || null,
      },
    });

    if (message.attachments?.length) {
      await tx.estimateAiAttachment.createMany({
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

  return session;
};

export class CreateFullEstimateForProjectController {
  async handle(req: MulterRequest, res: Response) {
    const { projectId } = req.params;
    const pdfFile = req.files?.file?.[0];
    const attachments = req.files?.attachments || [];
    let uploadedPdfUri: string | null = null;
    const uploadedAttachmentUris: string[] = [];
    const stagedAttachmentUris: string[] = [];
    let shouldCleanupStagedAttachments = true;

    try {
      const payload = parsePayload(req.body.payload);
      validatePayload(projectId, payload);
      const userId = (req as any).userId;
      const stagedPdfUpload = payload.pdf?.upload;
      if (!pdfFile && !stagedPdfUpload) throw new Error("PDF file is required");

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          company: { select: { id: true, name: true, signature: true } },
          client: true,
        },
      });

      if (!project) throw new Error("Project not found");
      if (!project.company_id) throw new Error("Project company is required");
      const projectCompanyId = project.company_id;

      const pdfUri = pdfFile
        ? await uploadSignedPdf(pdfFile, project.company || undefined)
        : await uploadSignedStagedPdf(stagedPdfUpload!, {
          companyId: projectCompanyId,
          userId,
        }, project.company || undefined);
      uploadedPdfUri = pdfUri;
      const pdfOriginalName = pdfFile?.originalname || stagedPdfUpload?.originalName || "estimate.pdf";

      const uploadedAttachments: Array<{ originalName: string; uri: string }> = [];
      for (const attachment of attachments) {
        const uri = await uploadFileToS3_2(attachment, "");
        uploadedAttachmentUris.push(uri);
        uploadedAttachments.push({ originalName: attachment.originalname, uri });
      }

      const stagedUploads = payload.attachments
        ?.map((metadata, index) => ({ metadata, index }))
        .filter(({ metadata }) => metadata.upload) || [];

      for (const { metadata } of stagedUploads) {
        await verifyStagedUploadReference(metadata.upload!, {
          companyId: projectCompanyId,
          userId,
          purpose: "estimate-attachment",
        });
        stagedAttachmentUris.push(metadata.upload!.key);
        uploadedAttachments.push({
          originalName: metadata.upload!.originalName,
          uri: metadata.upload!.key,
        });
      }

      const result = await prisma.$transaction(async (tx) => {
        const templateNumberInt = parseInt(String(payload.pdf?.templateNumber || "1"));

        const pdfProject = await tx.pdfProject.create({
          data: {
            original_file_name: pdfOriginalName,
            type_pdf: payload.pdf?.type_pdf || "estimate",
            uri: pdfUri,
            project_id: project.id,
            templateNumber: templateNumberInt,
          },
        });

        const financialFields = buildEstimateFinancialFields({
          subtotal: payload.estimate.totalAmount,
          amountPaid: payload.estimate.amountPaid,
          markupType: payload.estimate.markupType ?? undefined,
          markupValue: payload.estimate.markupValue ?? undefined,
          discountType: payload.estimate.discountType ?? undefined,
          discountValue: payload.estimate.discountValue ?? undefined,
          depositType: payload.estimate.depositType ?? undefined,
          depositValue: payload.estimate.depositValue ?? undefined,
        });
        const dateCreation = parseOptionalDate(payload.estimate.date_creation, "date_creation");

        const estimate = await tx.estimate.create({
          data: {
            number: payload.estimate.preGeneratedNumber,
            approvedAt: new Date(),
            totalAmount: financialFields.totalAmount,
            balanceDue: financialFields.balanceDue,
            amountPaid: payload.estimate.amountPaid ?? 0,
            markupType: financialFields.markupType,
            markupValue: financialFields.markupValue,
            markupAmount: financialFields.markupAmount,
            discountType: financialFields.discountType,
            discountValue: financialFields.discountValue,
            discountAmount: financialFields.discountAmount,
            depositType: financialFields.depositType,
            depositValue: financialFields.depositValue,
            depositAmount: financialFields.depositAmount,
            finalAmount: financialFields.finalAmount,
            description: payload.estimate.description || null,
            terms: payload.estimate.terms || null,
            status: payload.estimate.status || "pending",
            type_estimate: payload.estimate.type_estimate,
            assignatureRequired: payload.estimate.type_estimate === "estimateProject" && payload.estimate.isProjectFlow ? true : false,
            multi_emails: payload.estimate.multi_emails || null,
            isStandaloneEstimate: payload.estimate.isStandaloneEstimate ?? false,
            date_creation: dateCreation,
            project: { connect: { id: project.id } },
          },
        });

        await tx.pdfProject.update({
          where: { id: pdfProject.id },
          data: { estimate_id: estimate.id },
        });

        if (payload.estimate.workContextId) {
          await tx.project.update({
            where: { id: project.id },
            data: { workContextId: payload.estimate.workContextId },
          });
        }

        for (let index = 0; index < payload.services.length; index += 1) {
          const service = payload.services[index];
          const quantity = Number(service.quantity ?? 1);
          const unitPrice = Number(service.unitPrice ?? service.price ?? 0);
          const lineTotal = Number(service.lineTotal ?? quantity * unitPrice);

          await tx.estimateServiceProject.create({
            data: {
              estimateId: estimate.id,
              name: service.name,
              description: service.description || "",
              quantity,
              unitPrice,
              lineTotal,
              originalUnitPrice: service.originalUnitPrice ?? unitPrice,
              originalLineTotal: service.originalLineTotal ?? lineTotal,
              notes: service.notes || null,
              id_service: service.id_service || null,
              hours: service.hours ?? quantity,
              price: service.price ?? unitPrice,
              start_date: service.start_date || null,
              deadline: service.deadline || null,
              pos: service.pos ?? index,
            },
          });
        }

        await syncEstimateDiscountedServices(tx, estimate.id);

        for (let index = 0; index < uploadedAttachments.length; index += 1) {
          const attachment = uploadedAttachments[index];
          const metadata = payload.attachments?.[index] || {};
          await tx.imagesAttachments.create({
            data: {
              url: attachment.uri,
              projectId: project.id,
              estimateId: estimate.id,
              original_filename: attachment.originalName,
              title: metadata.title,
              type_images_attachments: metadata.type_images_attachments || "image",
            },
          });
        }

        await importSmartBuilderSession(
          tx,
          estimate.id,
          project.company_id,
          (req as any).userId,
          payload.smartBuilderSession
        );

        return tx.estimate.findUnique({
          where: { id: estimate.id },
          include: {
            project: {
              include: {
                client: true,
                company: true,
                serviceProject: {
                  include: { photos: true },
                },
              },
            },
            serviceProjects: true,
            PdfProject: true,
            timelineEvents: true,
            imagesAttachments: true,
            emailLogs: true,
          },
        });
      });
      shouldCleanupStagedAttachments = false;

      if (result?.id) {
        fireAndForgetUpsertEstimateToQBO(project.company_id, (req as any).userId, result.id);
      }

      return res.status(201).json({
        message: "Estimate created successfully",
        data: result,
      });
    } catch (error: any) {
      if (pdfFile) await deleteFile(pdfFile.path);
      await removeLocalFiles(attachments);
      await Promise.all([
        deleteS3File(uploadedPdfUri),
        ...uploadedAttachmentUris.map((uri) => deleteS3File(uri)),
        ...(shouldCleanupStagedAttachments ? stagedAttachmentUris.map((uri) => deleteS3ObjectQuietly(uri)) : []),
      ]);

      if (DISCOUNT_ERRORS.has(error?.message) || VALIDATION_ERRORS.has(error?.message)) {
        return res.status(400).json({ error: error.message });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return res.status(409).json({ error: "Estimate already exists with this number" });
      }

      console.error("[CreateFullEstimateForProjectController]", error);
      return res.status(500).json({
        error: "Internal server error while creating full estimate for project",
        ...(process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test" ? { details: error?.message } : {}),
      });
    }
  }
}
