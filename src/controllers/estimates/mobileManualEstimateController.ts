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

const PDFSHIFT_API_URL = "https://api.pdfshift.io/v3/convert/pdf";

type MobileManualEstimatePayload = {
  action: "save" | "createAndSend";
  companyId: string;
  sellerUserId: string;
  estimateNumber: string;
  dateCreation: string;
  templateNumber: 1;
  client: {
    id?: string;
    name: string;
    email: string;
    phone?: string | null;
  };
  workContextId?: string;
  location: {
    address: string;
    lat: string;
    lng: string;
    radius: string;
  };
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

      const verifiedEstimateNumber = await getVerifiedEstimateNumber(
        payload.companyId,
        payload.estimateNumber,
      );

      const normalizedServices = payload.services.map((service, index) => ({
        catalogServiceId: service.catalogServiceId || null,
        description: service.description || "",
        lineTotal: roundMoney(Number(service.lineTotal)),
        name: service.name.trim(),
        pos: Number.isFinite(service.pos) ? Number(service.pos) : index,
        quantity: Number(service.quantity),
        unitPrice: roundMoney(Number(service.unitPrice)),
      }));

      const totalAmount = roundMoney(
        normalizedServices.reduce((total, service) => total + service.lineTotal, 0),
      );

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
        services: normalizedServices,
        terms: payload.terms,
        totalAmount,
      });

      const pdfBuffer = await generatePdfBuffer(html);
      const pdfFileName = buildPdfFileName(payload.client.name, company.name, payload.dateCreation);
      const pdfS3Key = await uploadBufferToS3(pdfBuffer, pdfFileName, "application/pdf");

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

        const project = await tx.project.create({
          data: {
            balanceDue: totalAmount,
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
            balanceDue: totalAmount,
            date_creation: payload.dateCreation ? new Date(payload.dateCreation) : new Date(),
            description: "",
            finalAmount: totalAmount,
            multi_emails: "",
            number: verifiedEstimateNumber,
            status: "pending",
            terms: payload.terms,
            totalAmount,
            type_estimate: "estimate",
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
          normalizedServices.map((service) =>
            tx.estimateServiceProject.create({
              data: {
                description: service.description,
                estimateId: estimate.id,
                hours: service.quantity,
                id_service: service.catalogServiceId,
                lineTotal: service.lineTotal,
                name: service.name,
                originalLineTotal: service.lineTotal,
                originalUnitPrice: service.unitPrice,
                pos: service.pos,
                price: service.unitPrice,
                quantity: service.quantity,
                unitPrice: service.unitPrice,
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
        await sendEstimateEmail({
          clientEmail: payload.client.email,
          clientName: payload.client.name,
          company,
          estimateId: result.estimate.id,
          estimateNumber: verifiedEstimateNumber,
          location: payload.location.address,
          pdfBuffer,
          pdfFileName,
          totalAmount,
        });
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
    quantity: number;
    unitPrice: number;
  }>;
  terms: string;
  totalAmount: number;
}) {
  const serviceRows = input.services
    .map(
      (service) => `
        <tr>
          <td>
            <strong>${escapeHtml(service.name)}</strong>
            ${service.description ? `<div class="description">${escapeHtml(service.description)}</div>` : ""}
          </td>
          <td class="num">${formatNumber(service.quantity)}</td>
          <td class="num">${formatMoney(service.unitPrice)}</td>
          <td class="num amount">${formatMoney(service.lineTotal)}</td>
        </tr>
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

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #252C37; font-family: Arial, Helvetica, sans-serif; background: #ffffff; }
          .page { width: 794px; min-height: 1123px; padding: 52px 58px; background: #fff; }
          .top-meta { display: flex; justify-content: space-between; align-items: flex-start; }
          .meta { text-align: right; font-size: 13px; line-height: 1.45; }
          .meta-label { color: #B78A4F; font-size: 11px; text-transform: uppercase; font-weight: 800; }
          .meta-value { color: #111C2B; font-weight: 800; margin-bottom: 8px; }
          .title { margin: 14px 0 8px; text-align: center; color: #B78A4F; letter-spacing: 7px; font-size: 26px; font-weight: 800; }
          .title-line { width: 230px; height: 1px; background: #B78A4F; margin: 0 auto; }
          .prepared { text-align: center; text-transform: uppercase; color: #B78A4F; font-size: 11px; font-weight: 800; margin-top: 9px; }
          .info { display: grid; grid-template-columns: 1fr 1fr; gap: 64px; margin-top: 54px; }
          .logo { max-width: 160px; max-height: 88px; object-fit: contain; margin-bottom: 16px; }
          .fallback-logo { color: #B78A4F; font-size: 34px; font-weight: 900; margin-bottom: 18px; }
          .company-name { font-size: 15px; text-transform: uppercase; font-weight: 900; margin-bottom: 8px; }
          .small { color: #596273; font-size: 12px; line-height: 1.7; }
          .job { text-align: right; }
          .gold-label { color: #B78A4F; font-size: 12px; text-transform: uppercase; font-weight: 900; margin-bottom: 10px; }
          .job strong { display: block; font-size: 13px; margin-bottom: 4px; }
          .job-table { border-top: 1px solid #DADDE4; margin-top: 18px; padding-top: 14px; display: grid; grid-template-columns: 1fr auto; row-gap: 8px; column-gap: 16px; font-size: 12px; }
          .muted { color: #747B89; }
          .bold { font-weight: 900; }
          .section-line { height: 1px; background: #DADDE4; margin: 34px 0 20px; }
          h2 { color: #B78A4F; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; margin: 0 0 14px; }
          table { width: 100%; border-collapse: collapse; }
          th { color: #252C37; font-size: 11px; text-transform: uppercase; text-align: right; padding: 8px 7px; border-bottom: 1px solid #DADDE4; }
          th:first-child { text-align: left; }
          td { vertical-align: top; font-size: 12px; padding: 10px 7px; border-bottom: 1px solid #ECE8E2; }
          .description { color: #747B89; font-size: 11px; line-height: 1.45; margin-top: 5px; white-space: pre-wrap; }
          .num { text-align: right; white-space: nowrap; }
          .amount { font-weight: 900; }
          .total { margin-top: 20px; padding-top: 16px; border-top: 2px solid #252C37; display: flex; justify-content: space-between; text-transform: uppercase; font-size: 18px; font-weight: 900; }
          .terms { white-space: pre-wrap; border: 1px solid #ECE8E2; border-radius: 8px; padding: 16px; min-height: 110px; color: #384153; font-size: 12px; line-height: 1.65; }
          .photos { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-top: 12px; }
          .photo { border: 1px solid #ECE8E2; border-radius: 8px; overflow: hidden; font-size: 11px; font-weight: 700; color: #596273; }
          .photo img { width: 100%; height: 180px; object-fit: cover; display: block; }
          .photo div { padding: 9px; }
          .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 70px; margin-top: 52px; }
          .signature-line { border-top: 1px solid #252C37; padding-top: 9px; text-align: center; color: #596273; font-size: 11px; font-weight: 700; }
        </style>
      </head>
      <body>
        <main class="page">
          <div class="top-meta">
            <div></div>
            <div class="meta">
              <div class="meta-label">Estimate #</div>
              <div class="meta-value">${formatEstimateDisplayNumber(input.estimateNumber)}</div>
              <div class="meta-label">Date</div>
              <div class="meta-value">${formatDate(input.dateCreation)}</div>
            </div>
          </div>
          <div class="title">ESTIMATE</div>
          <div class="title-line"></div>
          <div class="prepared">Prepared for ${escapeHtml(input.client.name)}</div>
          <section class="info">
            <div>
              ${
                input.company.logoUrl
                  ? `<img class="logo" src="${input.company.logoUrl}" />`
                  : `<div class="fallback-logo">SmartBuild</div>`
              }
              <div class="company-name">${escapeHtml(input.company.name)}</div>
              <div class="small">${escapeHtml(input.company.address || "")}</div>
              <div class="small">${escapeHtml(input.company.phone || "")}</div>
              <div class="small">${escapeHtml(input.company.email || "")}</div>
              <div class="small">${escapeHtml(input.company.webSiteUrl || "")}</div>
            </div>
            <div class="job">
              <div class="gold-label">Job Location</div>
              <strong>${escapeHtml(input.client.name)}</strong>
              <div class="small">${escapeHtml(input.location.address)}</div>
              <div class="job-table">
                <div class="muted">Estimate #</div><div class="bold">${formatEstimateDisplayNumber(input.estimateNumber)}</div>
                <div class="muted">Date</div><div class="bold">${formatDate(input.dateCreation)}</div>
                <div class="muted">Salesperson</div><div class="bold">${escapeHtml(input.seller.name)}</div>
              </div>
            </div>
          </section>
          <div class="section-line"></div>
          <h2>Scope of Work</h2>
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
          <div class="total"><span>Total</span><span>${formatMoney(input.totalAmount)}</span></div>
          <div class="section-line"></div>
          <h2>Terms & Conditions</h2>
          <div class="terms">${escapeHtml(input.terms || "")}</div>
          ${
            photoBlocks
              ? `<div class="section-line"></div><h2>Image Attachments</h2><div class="photos">${photoBlocks}</div>`
              : ""
          }
          <div class="signatures">
            <div class="signature-line">Company Signature</div>
            <div class="signature-line">Customer Signature</div>
          </div>
        </main>
      </body>
    </html>
  `;
}

function buildPdfFileName(clientName: string, companyName: string, dateCreation: string) {
  const date = dateCreation || new Date().toISOString().slice(0, 10);
  return `${sanitizeFileName(clientName)}_${sanitizeFileName(companyName)}_${date}.pdf`;
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
