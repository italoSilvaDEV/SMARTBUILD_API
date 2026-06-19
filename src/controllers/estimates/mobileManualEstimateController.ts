import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { Request, Response } from "express";

import { sendEmail } from "../../utils/sendEmail";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import { prisma } from "../../utils/prisma";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";
import { addCompanySignatureImageToPdfBuffer, addCompanySignatureToPdfBuffer } from "../../utils/pdfEstimateSignatures";
import {
  buildEstimateFinancialFields,
  distributeEstimateDiscountAcrossServices,
  type EstimateDiscountType,
} from "../../utils/estimateDiscount";

const PDFSHIFT_API_URL = "https://api.pdfshift.io/v3/convert/pdf";

type MobileManualEstimatePayload = {
  action: "save" | "createAndSend";
  companyId: string;
  sellerUserId: string;
  estimateNumber: string;
  dateCreation: string;
  templateNumber: 1;
  discountType?: EstimateDiscountType;
  discountValue?: number | null;
  client: {
    id?: string;
    name: string;
    email: string;
    phone?: string | null;
  };
  multi_emails?: string;
  workContextId?: string;
  location: {
    address: string;
    lat: string;
    lng: string;
    radius: string;
  };
  projectId?: string;
  terms: string;
  services: Array<{
    catalogServiceId?: string;
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    pos: number;
  }>;
  standalonePhotos?: Array<{
    title?: string;
    base64: string;
    mimeType: string;
    filename: string;
  }>;
};

const DISCOUNT_ERRORS = new Set([
  "Percentage discount cannot be greater than 100",
  "Fixed discount cannot be greater than estimate subtotal",
]);

export class MobileManualEstimateController {
  async handle(req: Request, res: Response) {
    const payload = req.body as MobileManualEstimatePayload;

    const validationError = validatePayload(payload);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    try {
      const [company, seller] = await Promise.all([
        prisma.company.findUnique({
          where: { id: payload.companyId },
          select: {
            address: true,
            avatar: true,
            email: true,
            id: true,
            name: true,
            phone: true,
            signature: true,
            webSiteUrl: true,
          },
        }),
        prisma.user.findUnique({
          where: { id: payload.sellerUserId },
          select: { email: true, id: true, name: true },
        }),
      ]);

      if (!company) return res.status(404).json({ error: "Company not found" });
      if (!seller) return res.status(404).json({ error: "Seller not found" });

      const existingProject = payload.projectId
        ? await prisma.project.findFirst({
            where: {
              company_id: payload.companyId,
              id: payload.projectId,
            },
            select: {
              client_id: true,
              id: true,
            },
          })
        : null;

      if (payload.projectId && !existingProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      const verifiedEstimateNumber = payload.projectId
        ? await getVerifiedProjectEstimateNumber(payload.projectId, payload.estimateNumber)
        : await getVerifiedEstimateNumber(payload.companyId, payload.estimateNumber);

      const normalizedServices = payload.services.map((service, index) => ({
        catalogServiceId: service.catalogServiceId || null,
        description: service.description || "",
        lineTotal: roundMoney(Number(service.lineTotal)),
        name: service.name.trim(),
        pos: Number.isFinite(service.pos) ? Number(service.pos) : index,
        quantity: Number(service.quantity),
        unitPrice: roundMoney(Number(service.unitPrice)),
      }));

      const subtotalAmount = roundMoney(
        normalizedServices.reduce((total, service) => total + service.lineTotal, 0),
      );
      const distributedEstimate = distributeEstimateDiscountAcrossServices({
        services: normalizedServices,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
        amountPaid: 0,
      });
      const financialFields = buildEstimateFinancialFields({
        subtotal: subtotalAmount,
        amountPaid: 0,
        discountType: payload.discountType,
        discountValue: payload.discountValue,
      });
      const totalAmount = roundMoney(Number(financialFields.totalAmount));
      const pdfServices = normalizedServices.map((service) => ({
        description: service.description,
        lineTotal: roundMoney(Number(service.lineTotal)),
        name: service.name,
        originalLineTotal: roundMoney(Number(service.lineTotal)),
        originalUnitPrice: roundMoney(Number(service.unitPrice)),
        quantity: service.quantity,
        unitPrice: roundMoney(Number(service.unitPrice)),
      }));

      const companyLogoUrl = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
      const html = buildClassicEstimateHtml({
        client: payload.client,
        company: {
          ...company,
          logoUrl: companyLogoUrl,
        },
        dateCreation: payload.dateCreation,
        estimateNumber: verifiedEstimateNumber,
        location: payload.location,
        photos: payload.standalonePhotos || [],
        seller,
        services: pdfServices,
        terms: payload.terms,
        discountAmount: Number(financialFields.discountAmount || 0),
        discountType: financialFields.discountType,
        discountValue: financialFields.discountValue,
        subtotalAmount,
        totalAmount,
      });

      const pdfBuffer = await generatePdfBuffer(html);
      const signedPdfBuffer = company.signature
        ? await addCompanySignatureImageToPdfBuffer(pdfBuffer, company.signature, company.name)
        : await addCompanySignatureToPdfBuffer(pdfBuffer, company.name, new Date());
      const pdfFileName = buildPdfFileName(payload.client.name, company.name, payload.dateCreation);
      const pdfS3Key = await uploadBufferToS3(signedPdfBuffer, pdfFileName, "application/pdf");

      const result = await prisma.$transaction(async (tx) => {
        let client = payload.client.id
          ? await tx.client.findFirst({
              where: {
                company_id: payload.companyId,
                id: payload.client.id,
              },
            })
          : null;

        if (!client) {
          client = await tx.client.findUnique({
            where: {
              email_company_id: {
                email: payload.client.email,
                company_id: payload.companyId,
              },
            },
          });
        }

        if (client) {
          client = await tx.client.update({
            where: { id: client.id },
            data: {
              name: payload.client.name,
              phone: payload.client.phone || "",
            },
          });
        } else {
          client = await tx.client.create({
            data: {
              company_id: payload.companyId,
              email: payload.client.email,
              name: payload.client.name,
              phone: payload.client.phone || "",
            },
          });
        }

        const workContext = await tx.workContext.findFirst({
          where: {
            clientId: client.id,
            id: payload.workContextId,
          },
          select: { id: true },
        });

        if (!workContext) {
          throw new Error("Work context not found for this client");
        }

        const project = existingProject
          ? existingProject
          : await tx.project.create({
              data: {
                balanceDue: Number(financialFields.balanceDue),
                client_id: client.id,
                company_id: payload.companyId,
                contract_number: Number(verifiedEstimateNumber),
                lat: payload.location.lat,
                location: payload.location.address,
                log: payload.location.lng,
                price: totalAmount,
                radius: Number(payload.location.radius || 100),
                seller_user_id: payload.sellerUserId,
                status_project: "Pending",
                workContextId: payload.workContextId || null,
              },
            });

        if (existingProject) {
          await tx.project.update({
            where: { id: existingProject.id },
            data: {
              client_id: client.id,
              lat: payload.location.lat,
              location: payload.location.address,
              log: payload.location.lng,
              radius: Number(payload.location.radius || 100),
              workContextId: payload.workContextId || null,
            },
          });
        }

        const pdfProject = await tx.pdfProject.create({
          data: {
            original_file_name: pdfFileName,
            project_id: project.id,
            templateNumber: payload.templateNumber,
            type_pdf: "estimate",
            uri: pdfS3Key,
          },
        });

        const estimate = await tx.estimate.create({
          data: {
            amountPaid: 0,
            balanceDue: Number(financialFields.balanceDue),
            date_creation: payload.dateCreation ? new Date(payload.dateCreation) : new Date(),
            description: "",
            discountAmount: financialFields.discountAmount,
            discountType: financialFields.discountType,
            discountValue: financialFields.discountValue,
            finalAmount: financialFields.finalAmount,
            multi_emails: payload.multi_emails || "",
            number: verifiedEstimateNumber,
            status: "pending",
            terms: payload.terms,
            totalAmount,
            type_estimate: existingProject ? "estimateProject" : "estimate",
            assignatureRequired: Boolean(existingProject),
            project: {
              connect: { id: project.id },
            },
          },
        });

        await tx.pdfProject.update({
          where: { id: pdfProject.id },
          data: {
            estimate_id: estimate.id,
          },
        });

        await Promise.all(
          distributedEstimate.services.map((service) =>
            tx.estimateServiceProject.create({
              data: {
                description: service.description,
                estimateId: estimate.id,
                hours: service.quantity,
                id_service: service.catalogServiceId,
                lineTotal: service.discountedLineTotal,
                name: service.name,
                originalLineTotal: service.originalLineTotal,
                originalUnitPrice: service.originalUnitPrice,
                pos: service.pos,
                price: service.discountedUnitPrice,
                quantity: service.quantity,
                unitPrice: service.discountedUnitPrice,
              },
            }),
          ),
        );

        await tx.estimateTimeline.create({
          data: {
            description: payload.action === "createAndSend" ? "Created and sent" : "Created",
            estimate: {
              connect: { id: estimate.id },
            },
          },
        });

        return {
          client,
          estimate,
          pdfProject,
          project,
        };
      });

      if (payload.standalonePhotos?.length) {
        await uploadStandalonePhotos({
          estimateId: result.estimate.id,
          photos: payload.standalonePhotos,
          projectId: result.project.id,
        });
      }

      let emailSent = false;
      if (payload.action === "createAndSend") {
        const recipients = normalizeEmailList(`${payload.client.email},${payload.multi_emails || ""}`);
        for (const recipient of recipients) {
          await sendEstimateEmail({
            clientEmail: recipient,
            clientName: payload.client.name,
            company,
            estimateId: result.estimate.id,
            estimateNumber: verifiedEstimateNumber,
            location: payload.location.address,
            pdfBuffer: signedPdfBuffer,
            pdfFileName,
            totalAmount,
          });
        }
        emailSent = true;
      }

      fireAndForgetUpsertEstimateToQBO(payload.companyId, (req as any).userId, result.estimate.id);

      return res.status(201).json({
        emailSent,
        estimateId: result.estimate.id,
        number: verifiedEstimateNumber,
        pdfProjectId: result.pdfProject.id,
        projectId: result.project.id,
      });
    } catch (error) {
      console.error("[MobileManualEstimateController] Error creating manual estimate:", error);
      if (error instanceof Error && DISCOUNT_ERRORS.has(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      if (error instanceof Error && error.message === "Work context not found for this client") {
        return res.status(400).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  }

  async regeneratePdf(req: Request, res: Response) {
    const { estimateId } = req.params;

    if (!estimateId) {
      return res.status(400).json({ error: "Estimate ID is required" });
    }

    try {
      const estimate = await prisma.estimate.findUnique({
        where: { id: estimateId },
        include: {
          imagesAttachments: {
            orderBy: { date_creation: "asc" },
            select: {
              id: true,
              original_filename: true,
              title: true,
              url: true,
            },
          },
          PdfProject: {
            orderBy: { date_creation: "desc" },
            take: 1,
          },
          project: {
            include: {
              client: {
                select: {
                  email: true,
                  id: true,
                  name: true,
                  phone: true,
                },
              },
              company: {
                select: {
                  address: true,
                  avatar: true,
                  email: true,
                  id: true,
                  name: true,
                  phone: true,
                  signature: true,
                  webSiteUrl: true,
                },
              },
              user: {
                select: {
                  email: true,
                  id: true,
                  name: true,
                },
              },
              workContext: {
                select: {
                  Email: true,
                  Name: true,
                  phone: true,
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
          },
        },
      });

      if (!estimate) return res.status(404).json({ error: "Estimate not found" });
      if (!estimate.project) return res.status(400).json({ error: "Estimate has no project" });
      if (!estimate.project.company) return res.status(400).json({ error: "Estimate has no company" });

      const company = estimate.project.company;
      const clientName = estimate.project.workContext?.Name || estimate.project.client?.name || "Customer";
      const clientEmail = estimate.project.workContext?.Email || estimate.project.client?.email || "";
      const clientPhone = estimate.project.workContext?.phone || estimate.project.client?.phone || "";
      const seller = estimate.project.user || { email: "", id: "", name: "SmartBuild" };
      const services = estimate.serviceProjects.map((service: any, index: number) => ({
        catalogServiceId: service.id_service || null,
        description: service.description || "",
        lineTotal: roundMoney(Number(service.originalLineTotal ?? service.lineTotal ?? 0)),
        name: String(service.name || "").trim(),
        pos: Number.isFinite(Number(service.pos)) ? Number(service.pos) : index,
        quantity: Number(service.quantity ?? service.hours ?? 1),
        unitPrice: roundMoney(Number(service.originalUnitPrice ?? service.unitPrice ?? service.price ?? 0)),
      }));

      if (!services.length) {
        return res.status(400).json({ error: "At least one service is required" });
      }

      const subtotalAmount = roundMoney(services.reduce((total, service) => total + service.lineTotal, 0));
      const distributedEstimate = distributeEstimateDiscountAcrossServices({
        services,
        discountType: estimate.discountType,
        discountValue: estimate.discountValue,
        amountPaid: estimate.amountPaid,
      });
      const totalAmount = roundMoney(Number(distributedEstimate.totals.totalAmount));
      const pdfServices = services.map((service) => ({
        description: service.description,
        lineTotal: roundMoney(Number(service.lineTotal)),
        name: service.name,
        originalLineTotal: roundMoney(Number(service.lineTotal)),
        originalUnitPrice: roundMoney(Number(service.unitPrice)),
        quantity: service.quantity,
        unitPrice: roundMoney(Number(service.unitPrice)),
      }));
      const companyLogoUrl = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
      const photos = (await Promise.all(
        (estimate.imagesAttachments || []).flatMap((photo) =>
          photo.url
            ? [
                imageAttachmentToPdfPhoto({
                  filename: photo.original_filename || `estimate-image-${photo.id}.jpg`,
                  title: photo.title || "Attached Image",
                  url: photo.url,
                }),
              ]
            : [],
        ),
      )).filter((photo) => photo.base64);
      const dateCreation = estimate.date_creation
        ? estimate.date_creation.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);
      const html = buildClassicEstimateHtml({
        client: {
          email: clientEmail,
          id: estimate.project.client?.id,
          name: clientName,
          phone: clientPhone,
        },
        company: {
          ...company,
          logoUrl: companyLogoUrl,
        },
        dateCreation,
        estimateNumber: estimate.number,
        location: {
          address: estimate.project.location || "",
          lat: estimate.project.lat || "",
          lng: estimate.project.log || "",
          radius: String(estimate.project.radius || 100),
        },
        photos,
        seller: {
          email: seller.email || "",
          name: seller.name || "SmartBuild",
        },
        services: pdfServices,
        terms: estimate.terms || "",
        discountAmount: Number(distributedEstimate.totals.discountAmount || 0),
        discountType: distributedEstimate.totals.discountType,
        discountValue: distributedEstimate.totals.discountValue,
        subtotalAmount,
        totalAmount,
      });

      const pdfBuffer = await generatePdfBuffer(html);
      const signedPdfBuffer = company.signature
        ? await addCompanySignatureImageToPdfBuffer(pdfBuffer, company.signature, company.name)
        : await addCompanySignatureToPdfBuffer(pdfBuffer, company.name, new Date());
      const pdfFileName = buildPdfFileName(clientName, company.name, dateCreation);
      const pdfS3Key = await uploadBufferToS3(signedPdfBuffer, pdfFileName, "application/pdf");
      const existingPdf = Array.isArray(estimate.PdfProject) ? estimate.PdfProject[0] : null;

      const pdfProject = existingPdf
        ? await prisma.pdfProject.update({
            where: { id: existingPdf.id },
            data: {
              original_file_name: pdfFileName,
              templateNumber: 1,
              type_pdf: "estimate",
              uri: pdfS3Key,
            },
          })
        : await prisma.pdfProject.create({
            data: {
              estimate_id: estimate.id,
              original_file_name: pdfFileName,
              project_id: estimate.project.id,
              templateNumber: 1,
              type_pdf: "estimate",
              uri: pdfS3Key,
            },
          });

      await prisma.estimate.update({
        where: { id: estimate.id },
        data: {
          ...(estimate.status === "approved" ? { assignatureRequired: true } : {}),
          balanceDue: distributedEstimate.totals.balanceDue,
          discountAmount: distributedEstimate.totals.discountAmount,
          discountType: distributedEstimate.totals.discountType,
          discountValue: distributedEstimate.totals.discountValue,
          finalAmount: distributedEstimate.totals.finalAmount,
          totalAmount: distributedEstimate.totals.totalAmount,
        },
      });

      await prisma.estimateTimeline.create({
        data: {
          description: "PDF regenerated",
          estimate: { connect: { id: estimate.id } },
        },
      });

      fireAndForgetUpsertEstimateToQBO(company.id, (req as any).userId, estimate.id);

      return res.status(200).json({
        data: {
          id: pdfProject.id,
          original_file_name: pdfProject.original_file_name,
          uri: pdfProject.uri ? await getPresignedUrl(pdfProject.uri) : null,
        },
        message: "Estimate PDF regenerated successfully",
      });
    } catch (error) {
      console.error("[MobileManualEstimateController] Error regenerating PDF:", error);
      const message = error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ error: message });
    }
  }
}

function validatePayload(payload: MobileManualEstimatePayload) {
  if (!payload) return "Payload is required";
  if (!["save", "createAndSend"].includes(payload.action)) return "Invalid action";
  if (!payload.companyId) return "companyId is required";
  if (!payload.sellerUserId) return "sellerUserId is required";
  if (!payload.estimateNumber) return "estimateNumber is required";
  if (!payload.client?.name || !payload.client?.email) return "Client name and email are required";
  if (!payload.workContextId) return "workContextId is required";
  if (!payload.location?.address || !payload.location?.lat || !payload.location?.lng) {
    return "Location address, lat and lng are required";
  }
  if (!payload.services?.length) return "At least one service is required";

  const invalidService = payload.services.find(
    (service) =>
      !service.name?.trim() ||
      !Number.isFinite(Number(service.quantity)) ||
      Number(service.quantity) <= 0 ||
      !Number.isFinite(Number(service.unitPrice)) ||
      Number(service.unitPrice) <= 0 ||
      !Number.isFinite(Number(service.lineTotal)) ||
      Number(service.lineTotal) <= 0,
  );

  if (invalidService) return "All services require name, quantity, unitPrice and lineTotal";

  if ((payload.standalonePhotos || []).length > 10) return "Maximum of 10 images allowed";

  return null;
}

async function getVerifiedEstimateNumber(companyId: string, estimateNumber: string) {
  const requestedNumber = Number(String(estimateNumber).split(/[-/]/)[0]);
  const lastEstimate = await prisma.estimate.findFirst({
    where: {
      project: {
        company_id: companyId,
      },
    },
    orderBy: {
      date_creation: "desc",
    },
    select: {
      number: true,
    },
  });

  const lastNumber = Number(String(lastEstimate?.number || "0").split(/[-/]/)[0]);
  const verified = Number.isFinite(lastNumber) && lastNumber >= requestedNumber ? lastNumber + 1 : requestedNumber;

  return String(verified);
}

async function getVerifiedProjectEstimateNumber(projectId: string, estimateNumber: string) {
  const requestedNumber = String(estimateNumber || "").trim();
  if (!requestedNumber) return "1";

  const existingEstimates = await prisma.estimate.findMany({
    where: {
      projectId,
      type_estimate: "estimateProject",
    },
    orderBy: {
      date_creation: "desc",
    },
    select: {
      number: true,
    },
  });

  if (!existingEstimates.some((estimate) => estimate.number === requestedNumber)) {
    return requestedNumber;
  }

  const separator = requestedNumber.includes("-") ? "-" : "/";
  const [baseNumber] = requestedNumber.split(separator);
  const suffixes = existingEstimates
    .map((estimate) => String(estimate.number || ""))
    .filter((number) => number === baseNumber || number.startsWith(`${baseNumber}${separator}`))
    .map((number) => {
      const [, suffix] = number.split(separator);
      return Number(suffix || 0);
    })
    .filter((suffix) => Number.isFinite(suffix));
  const nextSuffix = Math.max(0, ...suffixes) + 1;

  return `${baseNumber}${separator}${String(nextSuffix).padStart(2, "0")}`;
}

async function getSafePresignedUrl(uri: string) {
  try {
    return await getPresignedUrl(uri);
  } catch {
    return "";
  }
}

async function generatePdfBuffer(html: string) {
  const apiKey = process.env.PDFSHIFT_API_KEY;
  if (!apiKey) {
    throw new Error("PDFSHIFT_API_KEY is not configured.");
  }

  const response = await axios.post(
    PDFSHIFT_API_URL,
    {
      source: html,
      sandbox: false,
      landscape: false,
      format: "A4",
      margin: "0",
      use_print: true,
      disable_javascript: true,
    },
    {
      headers: {
        Accept: "application/pdf",
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      responseType: "arraybuffer",
      timeout: Number(process.env.PDFSHIFT_TIMEOUT_MS || 90000),
    },
  );

  return Buffer.from(response.data);
}

async function uploadBufferToS3(buffer: Buffer, fileName: string, contentType: string) {
  const s3 = new S3Client({
    region: process.env.AMAZON_S3_REGION,
    credentials: {
      accessKeyId: process.env.AMAZON_S3_KEY!,
      secretAccessKey: process.env.AMAZON_S3_SECRET!,
    },
  });
  const key = `${crypto.randomBytes(4).toString("hex")}-${fileName.replace(/\s/g, "")}`;

  await s3.send(
    new PutObjectCommand({
      Body: buffer,
      Bucket: process.env.AMAZON_S3_BUCKET!,
      ContentType: contentType,
      Key: key,
    }),
  );

  return key;
}

async function uploadStandalonePhotos({
  estimateId,
  photos,
  projectId,
}: {
  estimateId: string;
  photos: NonNullable<MobileManualEstimatePayload["standalonePhotos"]>;
  projectId: string;
}) {
  const tempDir = path.join(os.tmpdir(), "smartbuild-mobile-estimate-images");
  fs.mkdirSync(tempDir, { recursive: true });

  for (const photo of photos) {
    const safeFileName = photo.filename || `estimate-image-${Date.now()}.jpg`;
    const tempFilePath = path.join(tempDir, `${crypto.randomBytes(6).toString("hex")}-${safeFileName}`);
    const buffer = Buffer.from(photo.base64, "base64");
    fs.writeFileSync(tempFilePath, buffer);

    const file = {
      destination: tempDir,
      encoding: "7bit",
      fieldname: "file",
      filename: path.basename(tempFilePath),
      mimetype: photo.mimeType || "image/jpeg",
      originalname: safeFileName,
      path: tempFilePath,
      size: buffer.length,
    } as Express.Multer.File;

    const s3Key = await uploadFileToS3_2(file, "");

    await prisma.imagesAttachments.create({
      data: {
        estimateId,
        original_filename: safeFileName,
        projectId,
        title: photo.title || "Attached Image",
        type_images_attachments: "image",
        url: s3Key,
      },
    });
  }
}

async function imageAttachmentToPdfPhoto({
  filename,
  title,
  url,
}: {
  filename: string;
  title: string;
  url: string;
}) {
  const presignedUrl = await getSafePresignedUrl(url);
  if (!presignedUrl) {
    return {
      base64: "",
      filename,
      mimeType: "image/jpeg",
      title,
    };
  }

  const response = await axios.get<ArrayBuffer>(presignedUrl, {
    responseType: "arraybuffer",
    timeout: Number(process.env.PDFSHIFT_TIMEOUT_MS || 90000),
  });
  const mimeType = String(response.headers["content-type"] || "image/jpeg");

  return {
    base64: Buffer.from(response.data).toString("base64"),
    filename,
    mimeType,
    title,
  };
}

async function sendEstimateEmail({
  clientEmail,
  clientName,
  company,
  estimateId,
  estimateNumber,
  location,
  pdfBuffer,
  pdfFileName,
  totalAmount,
}: {
  clientEmail: string;
  clientName: string;
  company: {
    avatar?: string | null;
    email?: string | null;
    id: string;
    name: string;
  };
  estimateId: string;
  estimateNumber: string;
  location: string;
  pdfBuffer: Buffer;
  pdfFileName: string;
  totalAmount: number;
}) {
  const companyAvatar = company.avatar ? await getSafePresignedUrl(company.avatar) : "";
  const totalFormatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(totalAmount);
  const validUntilDate = new Date();
  validUntilDate.setDate(validUntilDate.getDate() + 30);
  const validUntil = validUntilDate.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const reviewLink = `${process.env.URL_FRONT}/estimate-response/${estimateId}/${Buffer.from(clientEmail).toString("base64")}`;

  await sendEmail({
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        disposition: "attachment",
        filename: pdfFileName,
        type: "application/pdf",
      },
    ],
    companyId: company.id,
    dynamicTemplateData: {
      body: "",
      companyAvatar,
      companyName: company.name,
      companyReplyToEmail: company.email || "",
      currentYear: new Date().getFullYear().toString(),
      estimateNumber: formatEstimateDisplayNumber(estimateNumber),
      projectName: location || `Estimate #${formatEstimateDisplayNumber(estimateNumber)}`,
      recipientEmail: clientEmail,
      recipientName: clientName || "Customer",
      reviewLink,
      totalAmount: totalFormatted,
      validUntil,
    },
    subject: `Estimate ${formatEstimateDisplayNumber(estimateNumber)} from ${company.name}`,
    templateId: "d-c779b5bb2dc44a98b0428a0c17597a8d",
    to: clientEmail,
  });

  await prisma.estimateEmailLog.create({
    data: {
      estimate: { connect: { id: estimateId } },
      recipient: clientEmail,
      sentAt: new Date(),
      status: "success",
    },
  });

  await prisma.estimateTimeline.create({
    data: {
      description: `Email sent to: ${clientEmail}`,
      estimate: { connect: { id: estimateId } },
    },
  });
}

function buildClassicEstimateHtml(input: {
  client: MobileManualEstimatePayload["client"];
  company: {
    address?: string | null;
    email?: string | null;
    logoUrl: string;
    name: string;
    phone?: string | null;
    webSiteUrl?: string | null;
  };
  dateCreation: string;
  estimateNumber: string;
  location: MobileManualEstimatePayload["location"];
  photos: NonNullable<MobileManualEstimatePayload["standalonePhotos"]>;
  seller: { email: string; name: string };
  services: Array<{
    description: string;
    lineTotal: number;
    name: string;
    originalLineTotal?: number;
    originalUnitPrice?: number;
    quantity: number;
    unitPrice: number;
  }>;
  terms: string;
  discountAmount?: number | null;
  discountType?: EstimateDiscountType;
  discountValue?: number | null;
  subtotalAmount: number;
  totalAmount: number;
}) {
  const serviceRows = input.services
    .map(
      (service) => `
        <tr class="service-row">
          <td><strong>${escapeHtml(service.name)}</strong></td>
          <td class="num">${formatNumber(service.quantity)}</td>
          <td class="num">${formatMoney(service.unitPrice)}</td>
          <td class="num amount">${formatMoney(service.lineTotal)}</td>
        </tr>
        ${
          service.description
            ? `<tr class="description-row"><td colspan="4"><div class="description">${escapeHtml(service.description)}</div></td></tr>`
            : ""
        }
      `,
    )
    .join("");
  const photoBlocks = input.photos
    .map(
      (photo) => `
        <div class="photo">
          <img src="data:${photo.mimeType || "image/jpeg"};base64,${photo.base64}" />
          <div>${escapeHtml(photo.title || "Attached Image")}</div>
        </div>
      `,
    )
    .join("");
  const termsSection = input.terms?.trim()
    ? `
      <section class="terms-page">
        <h2 class="terms-title">TERMS & CONDITIONS</h2>
        <div class="terms-content">${escapeHtml(input.terms || "")}</div>
        <div class="contact-card">
          <h3>CONTACT INFORMATION</h3>
          <p>${escapeHtml(input.company.name)}</p>
          <p>${escapeHtml(input.company.address || "")}</p>
          <p>${escapeHtml(input.company.phone || "")}</p>
          <p>${escapeHtml(input.company.email || "")}</p>
        </div>
      </section>
    `
    : "";
  const imageSection = photoBlocks
    ? `
      <section class="images-page">
        <h2 class="terms-title">IMAGE ATTACHMENTS</h2>
        <div class="photos">${photoBlocks}</div>
      </section>
    `
    : "";
  const discountLabel = input.discountType === "percentage"
    ? `Discount (${formatNumber(Number(input.discountValue || 0))}%)`
    : "Discount";
  const totalsBlock = input.discountAmount
    ? `
      <div class="totals">
        <div class="summary-row"><span>Subtotal</span><span>${formatMoney(input.subtotalAmount)}</span></div>
        <div class="summary-row discount"><span>${discountLabel}</span><span>-${formatMoney(input.discountAmount)}</span></div>
        <div class="total"><span>Total</span><span>${formatMoney(input.totalAmount)}</span></div>
      </div>
    `
    : `<div class="total single-total"><span>Total</span><span>${formatMoney(input.totalAmount)}</span></div>`;

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          html, body { width: 210mm; min-height: 297mm; margin: 0; padding: 0; overflow-x: hidden; background: #ffffff; }
          body { color: #333333; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, Helvetica, sans-serif; line-height: 1.4; font-size: 12px; }
          .pdf-document { width: 210mm; min-height: 297mm; background: #fff; color: #333333; position: relative; box-sizing: border-box; overflow-x: hidden; }
          .classic-cover { width: 100%; background: #fff; box-sizing: border-box; page-break-after: auto; overflow: visible; position: relative; }
          .proposal-header { border-bottom: 1px solid #B78A4F; display: flex; align-items: flex-start; justify-content: space-between; padding: 12px 32px 10px; }
          .proposal-company { color: #222222; font-size: 14px; font-weight: 700; letter-spacing: 0.4px; text-transform: uppercase; margin-bottom: 4px; }
          .proposal-subtitle { color: #7a7a7a; font-size: 11px; }
          .proposal-brand { text-align: right; }
          .proposal-brand img { max-width: 44px; max-height: 26px; object-fit: contain; display: block; margin-left: auto; margin-bottom: 1px; }
          .proposal-fallback { color: #B78A4F; font-size: 14px; font-weight: 700; margin-bottom: 1px; }
          .proposal-label { color: #B78A4F; font-size: 9px; font-weight: 700; letter-spacing: 3px; text-transform: uppercase; margin-top: 3px; }
          .cover-body { padding: 28px 24px 8px; background: #fff; }
          .cover-title { text-align: center; color: rgba(183, 138, 79, 0.58); font-size: 11px; letter-spacing: 7px; text-transform: uppercase; margin-bottom: 20px; line-height: 1; }
          .info { display: grid; grid-template-columns: 1fr 1fr; gap: 152px; align-items: start; }
          .logo-shell { width: 190px; height: 68px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; background: #fff; }
          .logo { max-height: 69.575px; width: auto; object-fit: contain; display: block; }
          .fallback-logo { color: #B78A4F; font-size: 28px; font-weight: 700; }
          .company-name { color: #1f1f1f; font-size: 14px; text-transform: uppercase; font-weight: 700; margin-bottom: 10px; }
          .small { color: #555555; font-size: 11px; line-height: 1.7; }
          .small .link { color: #B78A4F; text-decoration: underline; }
          .job { text-align: right; }
          .client-card, .job-location-card { margin-bottom: 10px; }
          .gold-label { color: #B78A4F; font-size: 14px; font-weight: 700; margin-bottom: 8px; }
          .job-address { color: #3f3f3f; font-size: 11px; line-height: 1.6; }
          .job-table { border-top: 1px solid #d8d8d8; margin-top: 18px; padding-top: 12px; display: grid; grid-template-columns: 1fr auto; row-gap: 8px; column-gap: 18px; align-items: center; font-size: 11px; }
          .muted { color: #8b8b8b; }
          .bold { color: #1f1f1f; font-weight: 700; }
          .estimate-number { color: #B78A4F; font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
          .services-section { padding: 20px 24px 24px; background: #fff; display: block; page-break-inside: auto; overflow: visible; }
          .services-separator { padding-bottom: 18px; margin-bottom: 32px; border-bottom: 2px solid #e5e7eb; }
          h2 { color: #1a1a1a; font-size: 18px; font-weight: 400; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 8px; }
          .section-title-line { width: 100%; height: 3px; background: #1a1a1a; margin-bottom: 20px; }
          table { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e9ecef; border-radius: 6px; overflow: hidden; }
          th { color: #374151; background: #f8f9fa; font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; text-align: right; padding: 12px 16px; border-bottom: 1px solid #e9ecef; }
          th:first-child { text-align: left; }
          td { vertical-align: top; font-size: 12px; padding: 16px; border-bottom: 1px solid #f1f3f4; }
          .service-row td { border-bottom: 0; }
          .description-row td { padding: 0 16px 16px; border-bottom: 1px solid #f1f3f4; }
          tr:last-child td { border-bottom: 0; }
          .description { color: #6b7280; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; font-size: 10px; line-height: 1.5; padding: 12px; white-space: pre-wrap; width: 100%; }
          .num { text-align: right; white-space: nowrap; }
          .amount { color: #1a1a1a; font-weight: 600; }
          .totals { margin-top: 30px; }
          .summary-row { display: flex; justify-content: space-between; padding: 4px 16px; color: #555; font-size: 12px; font-weight: 700; }
          .summary-row.discount { color: #B83232; }
          .total { margin-top: 10px; padding: 12px 16px; border-top: 3px solid #1a1a1a; background: #f8f9fa; border-radius: 4px; display: flex; justify-content: space-between; text-transform: uppercase; font-size: 20px; font-weight: 700; }
          .single-total { margin-top: 30px; }
          .terms-page { page-break-before: always; break-before: page; margin-top: 0; padding: 40px; min-height: 297mm; box-sizing: border-box; }
          .terms-title { color: #000; font-size: 18px; font-weight: 600; text-transform: uppercase; margin: 0 0 24px; letter-spacing: 0; }
          .terms-content { white-space: pre-wrap; color: #333; font-size: 12px; line-height: 1.6; }
          .contact-card { margin-top: 40px; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; }
          .contact-card h3 { font-size: 14px; font-weight: 600; margin: 0 0 16px; }
          .contact-card p { margin: 4px 0; font-size: 12px; }
          .images-page { page-break-before: always; break-before: page; margin-top: 0; padding: 40px; min-height: 297mm; box-sizing: border-box; }
          .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 12px; }
          .photo { border: 1px solid #ECE8E2; border-radius: 8px; overflow: hidden; font-size: 11px; font-weight: 700; color: #596273; }
          .photo img { width: 100%; height: 180px; object-fit: cover; display: block; }
          .photo div { padding: 9px; }
          .signature-block { margin: 130px 48px 24px; page-break-inside: avoid; break-inside: avoid; }
          .signature-table { width: 100%; border-collapse: collapse; table-layout: fixed; border: none; }
          .signature-table td { width: 50%; vertical-align: bottom; border: none; padding: 0; }
          .signature-table td:first-child { padding-right: 24px; }
          .signature-table td:last-child { padding-left: 24px; }
          .signature-box { min-height: 72px; display: flex; flex-direction: column; justify-content: flex-end; }
          .signature-line { border-top: 1px solid #000; padding-top: 6px; margin-bottom: 4px; }
          .signature-line p { font-size: 12px; text-align: center; margin: 0; font-weight: 600; }
        </style>
      </head>
      <body>
        <main class="pdf-document">
          <header class="proposal-header">
            <div>
              <div class="proposal-company">${escapeHtml(input.company.name)}</div>
              <div class="proposal-subtitle">Professional Estimate & Proposal</div>
            </div>
            <div class="proposal-brand">
              ${
                input.company.logoUrl
                  ? `<img src="${input.company.logoUrl}" />`
                  : `<div class="proposal-fallback">SB</div>`
              }
              <div class="proposal-label">Estimate</div>
            </div>
          </header>
          <section class="classic-cover">
            <div class="cover-body">
              <div class="cover-title">Estimate</div>
              <div class="info">
                <div>
                  <div class="logo-shell">
                    ${
                      input.company.logoUrl
                        ? `<img class="logo" src="${input.company.logoUrl}" />`
                        : `<div class="fallback-logo">SB</div>`
                    }
                  </div>
                  <div class="company-name">${escapeHtml(input.company.name)}</div>
                  <div class="small">
                    ${input.company.address ? `<div>${escapeHtml(input.company.address)}</div>` : ""}
                    ${input.company.phone ? `<div>Phone: <span class="link">${escapeHtml(input.company.phone)}</span></div>` : ""}
                    ${input.company.email ? `<div>Email: <span class="link">${escapeHtml(input.company.email)}</span></div>` : ""}
                    ${input.company.webSiteUrl ? `<div>Web: <span class="link">${escapeHtml(input.company.webSiteUrl)}</span></div>` : ""}
                  </div>
                </div>
                <div class="job">
                  <div class="client-card">
                    <div class="gold-label">Client</div>
                    <div class="job-address">
                      <div>${escapeHtml(input.client.name || "Client Name")}</div>
                      ${input.client.email ? `<div>${escapeHtml(input.client.email)}</div>` : ""}
                      ${input.client.phone ? `<div>${escapeHtml(input.client.phone)}</div>` : ""}
                    </div>
                  </div>
                  <div class="job-location-card">
                    <div class="gold-label">Job Location</div>
                    <div class="job-address">
                      <div>${escapeHtml(input.location.address)}</div>
                    </div>
                  </div>
                  <div class="job-table">
                    <div class="muted">Estimate #</div><div class="estimate-number">${formatEstimateDisplayNumber(input.estimateNumber)}</div>
                    <div class="muted">Date</div><div class="bold">${formatDate(input.dateCreation)}</div>
                    <div class="muted">Salesperson</div><div class="bold">${escapeHtml(input.seller.name)}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section class="services-section">
            <div class="services-separator"></div>
            <h2>Scope of Work</h2>
            <div class="section-title-line"></div>
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>${serviceRows}</tbody>
            </table>
            ${totalsBlock}
          </section>
          ${termsSection}
          ${imageSection}
          <section class="signature-block">
            <table role="presentation" class="signature-table">
              <tbody>
                <tr>
                  <td>
                    <div class="signature-box">
                      <div class="signature-line"><p>Company Signature</p></div>
                    </div>
                  </td>
                  <td>
                    <div class="signature-box">
                      <div class="signature-line"><p>Customer Signature</p></div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        </main>
      </body>
    </html>
  `;
}

function buildPdfFileName(clientName: string, companyName: string, dateCreation: string) {
  const date = dateCreation || new Date().toISOString().slice(0, 10);
  return `${sanitizeFileName(clientName)}_${sanitizeFileName(companyName)}_${date}.pdf`;
}

function normalizeEmailList(value: string) {
  return Array.from(
    new Set(
      String(value || "")
        .split(/[,\n;]/)
        .map((email) => email.trim())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  );
}

function sanitizeFileName(value: string) {
  return (value || "estimate").replace(/[^a-z0-9_-]+/gi, "_").replace(/^_+|_+$/g, "");
}

function formatEstimateDisplayNumber(number: string) {
  const raw = String(number || "").trim();
  if (!raw) return "-";
  if (raw.includes("-") || raw.includes("/")) return raw;
  return `${raw}-01`;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(value || 0);
}

function formatDate(value: string) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US");
}

function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function roundMoney(value: number) {
  return Math.round((value || 0) * 100) / 100;
}
