import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import fs from "fs";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";
import { buildEstimateFinancialFields } from "../../utils/estimateDiscount";
import {
  addClientSignatureImageToPdfBuffer,
  addCompanySignatureImageToPdfBuffer,
  addCompanySignatureToPdfBuffer,
  addManualApprovalClientSignatureToPdfBuffer,
} from "../../utils/pdfEstimateSignatures";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";
import {
  deleteS3ObjectQuietly,
  getStagedObjectBuffer,
  putS3ObjectBuffer,
  StagedUploadReference,
  verifyStagedUploadReference,
} from "../../utils/S3/stagedUpload";

type EstimateEditService = {
  id?: string;
  name?: string;
  description?: string | null;
  quantity?: number | string | null;
  unitPrice?: number | string | null;
  lineTotal?: number | string | null;
  notes?: string | null;
  id_service?: string | null;
  hours?: number | string | null;
  price?: number | string | null;
  start_date?: string | null;
  deadline?: string | null;
  pos?: number | string | null;
};

type UpdateFullEstimatePayload = {
  fields?: {
    description?: string | null;
    terms?: string | null;
    totalAmount?: number | string | null;
    multi_emails?: string | null;
    date_creation?: string | null;
    markupType?: "fixed" | "percentage" | null;
    markupValue?: number | string | null;
    discountType?: "fixed" | "percentage" | null;
    discountValue?: number | string | null;
    depositType?: "fixed" | "percentage" | null;
    depositValue?: number | string | null;
    client?: {
      id?: string;
      name?: string;
      email?: string;
      phone?: string | null;
    };
    location?: {
      address?: string;
      lat?: string;
      lng?: string;
      radius?: string | number | null;
    };
    workContextId?: string | null;
  };
  services?: {
    create?: EstimateEditService[];
    update?: EstimateEditService[];
    delete?: string[];
  };
  attachments?: {
    create?: Array<{
      title?: string | null;
      type_images_attachments?: "image" | "document";
      upload?: StagedUploadReference;
    }>;
    delete?: string[];
  };
  pdf?: {
    templateNumber?: number | string;
    clearSignature?: boolean;
    upload?: StagedUploadReference;
  };
};

type MulterRequest = Request & {
  files?: {
    file?: Express.Multer.File[];
    attachments?: Express.Multer.File[];
  };
};

const DISCOUNT_ERRORS = new Set([
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
  "Estimate not found",
  "Estimate company is required",
  "PDF not found for this estimate",
  "Service ID is required",
  "Service not found",
  "Name, quantity, unitPrice and lineTotal are required",
  "workContextId is required",
  "Client not found",
  "Work context not found for this client",
  "Attachment not found",
]);

const parsePayload = (rawPayload: unknown): UpdateFullEstimatePayload => {
  if (!rawPayload || typeof rawPayload !== "string") {
    throw new Error("payload is required");
  }

  try {
    return JSON.parse(rawPayload);
  } catch {
    throw new Error("payload must be valid JSON");
  }
};

const cleanEmpty = (value: string | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const optionalNumber = (value: number | string | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  return Number(value);
};

const optionalDate = (value: string | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("date_creation must be a valid date");
  }

  return date;
};

const removeLocalFiles = async (files: Express.Multer.File[]) => {
  await Promise.all(files.map((file) => deleteFile(file.path)));
};

const getUploadedFiles = (req: MulterRequest) => ({
  pdfFile: req.files?.file?.[0],
  attachments: req.files?.attachments || [],
});

const deleteS3Files = async (uris: Array<string | null | undefined>) => {
  await Promise.all(uris.filter(Boolean).map(async (uri) => {
    try {
      await deleteFileFromS3(uri!);
    } catch (error) {
      console.error("[UpdateFullEstimateController] Failed to delete S3 file:", error);
    }
  }));
};

const signPdfBuffer = async (
  rawPdfBuffer: Buffer,
  estimate: any,
  clearSignature?: boolean
) => {
  const company = estimate.project?.company;
  const companyName = company?.name || "Company";
  const companySignature = company?.signature;
  const clientName = estimate.project?.workContext?.Name || estimate.project?.client?.name || "Client";
  let pdfToUpload = companySignature
    ? await addCompanySignatureImageToPdfBuffer(rawPdfBuffer, companySignature, companyName)
    : await addCompanySignatureToPdfBuffer(rawPdfBuffer, companyName, new Date());

  const shouldReapplyClientSignature =
    !clearSignature &&
    estimate.status === "approved" &&
    estimate.clientSignature;

  if (shouldReapplyClientSignature) {
    let clientSignatureApplied = false;
    try {
      const parsed = JSON.parse(estimate.clientSignature) as { signature?: string; manualApproval?: boolean };
      if (parsed.signature && !parsed.manualApproval) {
        pdfToUpload = await addClientSignatureImageToPdfBuffer(pdfToUpload, parsed.signature);
        clientSignatureApplied = true;
      }
    } catch (error) {
      console.error("[UpdateFullEstimateController] Could not reapply client signature:", error);
    }

    if (!clientSignatureApplied) {
      pdfToUpload = await addManualApprovalClientSignatureToPdfBuffer(pdfToUpload, clientName, new Date());
    }
  }

  return pdfToUpload;
};

const buildFinalPdfFileName = (originalName: string) => {
  const fileHash = crypto.randomBytes(4).toString("hex");
  return `${fileHash}-${originalName.replace(/\s/g, "")}`;
};

const uploadSignedPdfBuffer = async (
  pdfBuffer: Buffer,
  originalName: string,
  estimate: any,
  clearSignature?: boolean
) => {
  if (!originalName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Only PDF files are allowed");
  }

  const pdfToUpload = await signPdfBuffer(pdfBuffer, estimate, clearSignature);
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

const uploadSignedPdf = async (
  file: Express.Multer.File,
  estimate: any,
  clearSignature?: boolean
) => {
  const rawPdfBuffer = await fs.promises.readFile(file.path);
  const fileName = await uploadSignedPdfBuffer(rawPdfBuffer, file.originalname, estimate, clearSignature);
  await deleteFile(file.path);
  return fileName;
};

const uploadSignedStagedPdf = async (
  upload: StagedUploadReference,
  params: { companyId: string; userId: string },
  estimate: any,
  clearSignature?: boolean
) => {
  await verifyStagedUploadReference(upload, {
    companyId: params.companyId,
    userId: params.userId,
    purpose: "estimate-pdf",
  });

  const rawPdfBuffer = await getStagedObjectBuffer(upload.key);
  const fileName = buildFinalPdfFileName(upload.originalName || "estimate.pdf");
  const signedPdfBuffer = await signPdfBuffer(rawPdfBuffer, estimate, clearSignature);
  await putS3ObjectBuffer({ key: fileName, body: signedPdfBuffer, contentType: "application/pdf" });
  await deleteS3ObjectQuietly(upload.key);
  return fileName;
};

const validateServiceCreate = (service: EstimateEditService) => {
  if (
    !service.name ||
    service.quantity === undefined ||
    service.quantity === null ||
    service.unitPrice === undefined ||
    service.unitPrice === null ||
    service.lineTotal === undefined ||
    service.lineTotal === null
  ) {
    throw new Error("Name, quantity, unitPrice and lineTotal are required");
  }
};

const buildServiceData = (service: EstimateEditService, includeOriginals: boolean) => {
  const data: any = {};

  if (service.name !== undefined) data.name = service.name;
  if (service.description !== undefined) data.description = service.description || "";
  if (service.quantity !== undefined) data.quantity = Number(service.quantity);
  if (service.unitPrice !== undefined) {
    data.unitPrice = Number(service.unitPrice);
    if (includeOriginals) data.originalUnitPrice = Number(service.unitPrice);
  }
  if (service.lineTotal !== undefined) {
    data.lineTotal = Number(service.lineTotal);
    if (includeOriginals) data.originalLineTotal = Number(service.lineTotal);
  }
  if (service.notes !== undefined) data.notes = service.notes;
  if (service.id_service !== undefined) data.id_service = service.id_service || null;
  if (service.hours !== undefined) data.hours = service.hours === null ? null : Number(service.hours);
  if (service.price !== undefined) data.price = service.price === null ? null : Number(service.price);
  if (service.start_date !== undefined) data.start_date = service.start_date;
  if (service.deadline !== undefined) data.deadline = service.deadline;
  if (service.pos !== undefined) data.pos = service.pos === null ? null : Number(service.pos);

  return data;
};

export class UpdateFullEstimateController {
  async handle(req: MulterRequest, res: Response) {
    const { estimateId } = req.params;
    const { pdfFile, attachments } = getUploadedFiles(req);
    const uploadedUris: string[] = [];
    let newPdfUri: string | null = null;
    let oldPdfUri: string | null = null;
    const oldAttachmentUris: string[] = [];
    const stagedAttachmentUris: string[] = [];
    let shouldCleanupStagedAttachments = true;

    try {
      if (!estimateId) throw new Error("Estimate ID is required");

      const payload = parsePayload(req.body.payload);
      const fields = payload.fields || {};
      const serviceCreates = payload.services?.create || [];
      const serviceUpdates = payload.services?.update || [];
      const serviceDeletes = payload.services?.delete || [];
      const attachmentCreates = payload.attachments?.create || [];
      const attachmentDeletes = payload.attachments?.delete || [];
      const clearSignature = !!payload.pdf?.clearSignature;
      const stagedPdfUpload = payload.pdf?.upload;
      const userId = (req as any).userId;
      if (!pdfFile && !stagedPdfUpload) throw new Error("PDF file is required");

      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId },
        include: {
          project: {
            include: {
              company: true,
              client: true,
              workContext: true,
            },
          },
          serviceProjects: true,
        },
      });

      if (!estimate) throw new Error("Estimate not found");
      if (!estimate.project?.company_id) throw new Error("Estimate company is required");
      const estimateCompanyId = estimate.project.company_id;

      const existingPdf = await prisma.pdfProject.findFirst({
        where: { estimate_id: estimateId },
      });

      if (!existingPdf) throw new Error("PDF not found for this estimate");
      oldPdfUri = existingPdf.uri;

      for (const service of serviceCreates) {
        validateServiceCreate(service);
      }

      newPdfUri = pdfFile
        ? await uploadSignedPdf(pdfFile, estimate, clearSignature)
        : await uploadSignedStagedPdf(stagedPdfUpload!, {
          companyId: estimateCompanyId,
          userId,
        }, estimate, clearSignature);
      uploadedUris.push(newPdfUri);
      const pdfOriginalName = pdfFile?.originalname || stagedPdfUpload?.originalName || "estimate.pdf";

      const uploadedAttachments: Array<{ originalName: string; uri: string }> = [];
      for (const attachment of attachments) {
        const uri = await uploadFileToS3_2(attachment, "");
        uploadedUris.push(uri);
        uploadedAttachments.push({ originalName: attachment.originalname, uri });
      }

      const stagedAttachmentCreates = attachmentCreates
        .map((metadata, index) => ({ metadata, index }))
        .filter(({ metadata }) => metadata.upload);

      for (const { metadata } of stagedAttachmentCreates) {
        await verifyStagedUploadReference(metadata.upload!, {
          companyId: estimateCompanyId,
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
        const nextClientId = fields.client?.id || estimate.project?.client_id;
        const nextWorkContextId =
          fields.workContextId !== undefined
            ? fields.workContextId || null
            : estimate.project?.workContextId;

        const projectData: any = {};

        if (fields.client?.id) {
          const existingClient = await tx.client.findFirst({
            where: {
              id: fields.client.id,
              company_id: estimate.project?.company_id,
            },
            select: { id: true },
          });

          if (!existingClient) throw new Error("Client not found");
          projectData.client_id = existingClient.id;
        }

        if ((fields.client || fields.location) && !nextWorkContextId) {
          throw new Error("workContextId is required");
        }

        if (nextWorkContextId) {
          if (!nextClientId) throw new Error("Client not found");

          const existingWorkContext = await tx.workContext.findFirst({
            where: {
              clientId: nextClientId,
              id: nextWorkContextId,
            },
            select: { id: true },
          });

          if (!existingWorkContext) throw new Error("Work context not found for this client");
        }

        if (fields.location) {
          if (fields.location.address !== undefined) projectData.location = fields.location.address;
          if (fields.location.lat !== undefined) projectData.lat = fields.location.lat;
          if (fields.location.lng !== undefined) projectData.log = fields.location.lng;
          if (fields.location.radius !== undefined) projectData.radius = Number(fields.location.radius || 100);
        }

        if (fields.workContextId !== undefined) {
          projectData.workContextId = fields.workContextId || null;
        }

        if (Object.keys(projectData).length > 0 && estimate.project?.id) {
          await tx.project.update({
            where: { id: estimate.project.id },
            data: projectData,
          });
        }

        const estimateData: any = {};
        if (fields.description !== undefined) estimateData.description = cleanEmpty(fields.description);
        if (fields.terms !== undefined) estimateData.terms = cleanEmpty(fields.terms);
        if (fields.multi_emails !== undefined) estimateData.multi_emails = cleanEmpty(fields.multi_emails);
        if (fields.date_creation !== undefined) estimateData.date_creation = optionalDate(fields.date_creation);
        if (fields.markupType !== undefined) estimateData.markupType = fields.markupType;
        if (fields.markupValue !== undefined) estimateData.markupValue = optionalNumber(fields.markupValue);
        if (fields.discountType !== undefined) estimateData.discountType = fields.discountType;
        if (fields.discountValue !== undefined) estimateData.discountValue = optionalNumber(fields.discountValue);
        if (fields.depositType !== undefined) estimateData.depositType = fields.depositType;
        if (fields.depositValue !== undefined) estimateData.depositValue = optionalNumber(fields.depositValue);

        if (Object.keys(estimateData).length > 0) {
          await tx.estimate.update({
            where: { id: estimateId },
            data: estimateData,
          });
        }

        for (const service of serviceUpdates) {
          if (!service.id) throw new Error("Service ID is required");
          const existingService = await tx.estimateServiceProject.findUnique({
            where: { id: service.id },
          });

          if (!existingService || existingService.estimateId !== estimateId) {
            throw new Error("Service not found");
          }

          await tx.estimateServiceProject.update({
            where: { id: service.id },
            data: buildServiceData(service, true),
          });
        }

        for (const service of serviceCreates) {
          const nextPosition = service.pos !== undefined && service.pos !== null
            ? Number(service.pos)
            : ((await tx.estimateServiceProject.aggregate({
              where: { estimateId },
              _max: { pos: true },
            }))._max.pos ?? -1) + 1;

          await tx.estimateServiceProject.create({
            data: {
              estimateId,
              ...buildServiceData({ ...service, pos: nextPosition }, true),
              name: service.name!,
              description: service.description || "",
              quantity: Number(service.quantity),
              unitPrice: Number(service.unitPrice),
              lineTotal: Number(service.lineTotal),
              originalUnitPrice: Number(service.unitPrice),
              originalLineTotal: Number(service.lineTotal),
              id_service: service.id_service || null,
              pos: Number.isFinite(nextPosition) ? nextPosition : 0,
            },
          });
        }

        for (const serviceId of serviceDeletes) {
          const existingService = await tx.estimateServiceProject.findUnique({
            where: { id: serviceId },
          });

          if (!existingService || existingService.estimateId !== estimateId) {
            throw new Error("Service not found");
          }

          const siblingProject = await tx.serviceProject.findFirst({
            where: { estimateServiceId: serviceId },
          });

          if (siblingProject) {
            await tx.serviceProject.delete({ where: { id: siblingProject.id } });
          }

          await tx.estimateServiceProject.delete({ where: { id: serviceId } });
        }

        const willHaveServices =
          estimate.serviceProjects.length + serviceCreates.length - serviceDeletes.length > 0;

        if (willHaveServices) {
          await syncEstimateDiscountedServices(tx, estimateId);
        } else {
          const subtotal = fields.totalAmount !== undefined
            ? Number(fields.totalAmount)
            : Number(estimate.totalAmount || 0);
          const financialFields = buildEstimateFinancialFields({
            subtotal,
            amountPaid: estimate.amountPaid,
            markupType: fields.markupType !== undefined ? fields.markupType : estimate.markupType,
            markupValue: fields.markupValue !== undefined ? optionalNumber(fields.markupValue) : estimate.markupValue,
            discountType: fields.discountType !== undefined ? fields.discountType : estimate.discountType,
            discountValue: fields.discountValue !== undefined ? optionalNumber(fields.discountValue) : estimate.discountValue,
            depositType: fields.depositType !== undefined ? fields.depositType : estimate.depositType,
            depositValue: fields.depositValue !== undefined ? optionalNumber(fields.depositValue) : estimate.depositValue,
          });

          await tx.estimate.update({
            where: { id: estimateId },
            data: financialFields,
          });
        }

        for (let index = 0; index < uploadedAttachments.length; index += 1) {
          const attachment = uploadedAttachments[index];
          const metadata = attachmentCreates[index] || {};
          await tx.imagesAttachments.create({
            data: {
              url: attachment.uri,
              projectId: estimate.project?.id || null,
              estimateId,
              original_filename: attachment.originalName,
              title: metadata.title || null,
              type_images_attachments: metadata.type_images_attachments || "image",
            },
          });
        }

        for (const imageId of attachmentDeletes) {
          const image = await tx.imagesAttachments.findUnique({ where: { id: imageId } });
          if (!image || image.estimateId !== estimateId) throw new Error("Attachment not found");
          if (image.url) oldAttachmentUris.push(image.url);
          await tx.imagesAttachments.delete({ where: { id: imageId } });
        }

        await tx.pdfProject.update({
          where: { id: existingPdf.id },
          data: {
            original_file_name: pdfOriginalName,
            uri: newPdfUri,
            date_update: new Date(),
            templateNumber: payload.pdf?.templateNumber ? Number(payload.pdf.templateNumber) : existingPdf.templateNumber,
          },
        });

        if (clearSignature && estimate.status === "approved") {
          await tx.estimate.update({
            where: { id: estimateId },
            data: { assignatureRequired: true },
          });
        }

        return tx.estimate.findUnique({
          where: { id: estimateId },
          include: {
            project: {
              include: {
                client: true,
                company: true,
                workContext: true,
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

      await deleteS3Files([oldPdfUri, ...oldAttachmentUris]);
      fireAndForgetUpsertEstimateToQBO(estimate.project?.company_id, (req as any).userId, estimateId);

      return res.status(200).json({
        message: "Estimate updated successfully",
        data: result,
      });
    } catch (error: any) {
      await removeLocalFiles([...(pdfFile ? [pdfFile] : []), ...attachments]);
      await Promise.all([
        deleteS3Files(uploadedUris),
        ...(shouldCleanupStagedAttachments ? stagedAttachmentUris.map((uri) => deleteS3ObjectQuietly(uri)) : []),
      ]);

      if (DISCOUNT_ERRORS.has(error?.message) || VALIDATION_ERRORS.has(error?.message)) {
        return res.status(400).json({ error: error.message });
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return res.status(404).json({ error: "Record not found" });
      }

      console.error("[UpdateFullEstimateController]", error);
      return res.status(500).json({
        error: "Internal server error while updating full estimate",
        ...(process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test" ? { details: error?.message } : {}),
      });
    }
  }
}
