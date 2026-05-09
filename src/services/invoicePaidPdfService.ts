import axios from "axios";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { prisma } from "../utils/prisma";
import { deleteFileFromS3 } from "../utils/S3/deleteFileFromS3";
import { getPresignedUrl } from "../utils/S3/getPresignedUrl";
import { uploadFileToS3_2 } from "../utils/S3/uploadFIleS3";

const PDFSHIFT_API_URL = "https://api.pdfshift.io/v3/convert/pdf";

type GeneratePaidInvoicePdfOptions = {
  paymentAmount?: number;
  paidAt?: Date | string | null;
  paymentMethod?: string | null;
};

type PaidInvoiceAttachment = {
  filename: string;
  content: string;
  type: "application/pdf";
  disposition: "attachment";
};

type PaidInvoicePdfResult = {
  pdfInvoicePaid: any;
  pdfBuffer: Buffer;
  fileName: string;
  attachment: PaidInvoiceAttachment;
  summary: {
    invoiceId: string;
    invoiceNumber: string;
    targetTotal: number;
    amountPaidAfterPayment: number;
    remainingBalance: number;
    paymentAmount: number;
  };
};

function toNumber(value: any, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value || 0);
}

function dateLabel(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  }

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeDescriptionHtml(value: any) {
  if (!value) return "";

  let html = String(value).trim();

  // Some records may store rich text already entity-encoded. The frontend feeds
  // those descriptions into a DOM parser, so the backend needs to normalize the
  // same common entities before sanitizing.
  if (/&lt;\s*\/?\s*(p|br|strong|b|em|i|u|ul|ol|li)\b/i.test(html)) {
    html = html
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#039;/gi, "'")
      .replace(/&amp;/gi, "&");
  }

  html = html.replace(/&nbsp;/gi, " ");

  const withoutDangerousBlocks = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "");

  const hasAllowedHtml = /<\s*\/?\s*(p|br|strong|b|em|i|u|ul|ol|li)\b/i.test(withoutDangerousBlocks);

  if (!hasAllowedHtml) {
    return withoutDangerousBlocks
      .split(/\n+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => `<p>${escapeHtml(part)}</p>`)
      .join("");
  }

  const allowedTags = new Set(["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li"]);

  return withoutDangerousBlocks
    .replace(/<\s*(\/?)\s*([a-z0-9]+)\b[^>]*>/gi, (_match, closing, tag) => {
      const normalizedTag = String(tag).toLowerCase();
      if (!allowedTags.has(normalizedTag)) {
        return "";
      }

      if (normalizedTag === "br") {
        return "<br>";
      }

      return `<${closing}${normalizedTag}>`;
    })
    .replace(/<p>\s*<\/p>/gi, "")
    .trim();
}

function invoicePaymentAppliedAmount(invoice: any) {
  const partialApplications = (invoice.paymentApplications || []).reduce(
    (sum: number, payment: any) => sum + toNumber(payment.amountApplied),
    0
  );

  if (invoice.status === "partial") {
    if (partialApplications > 0) return partialApplications;
    return toNumber(invoice.totalAmountPaidQbo);
  }

  if (invoice.status === "paid") {
    return toNumber(invoice.totalAmount);
  }

  return 0;
}

function getInvoiceItemDisplayPrice(quantity: number, storedPrice: number, total: number) {
  if (quantity > 0 && total > 0) {
    const expectedTotal = quantity * storedPrice;
    const hasStoredPriceMismatch = Math.abs(expectedTotal - total) > 0.01;

    if (hasStoredPriceMismatch) {
      return total / quantity;
    }
  }

  return storedPrice;
}

function getInvoiceLineItems(invoice: any) {
  if (invoice.InvoiceItems?.length) {
    return invoice.InvoiceItems.map((item: any) => {
      const quantity = toNumber(item.quantity, 1);
      const total = toNumber(item.totalAmount);
      const storedPrice = toNumber(item.price);

      return {
        id: item.id,
        name: item.name,
        description: item.description,
        quantity,
        price: getInvoiceItemDisplayPrice(quantity, storedPrice, total),
        total,
      };
    });
  }

  if (invoice.estimate?.serviceProjects?.length) {
    return invoice.estimate.serviceProjects.map((service: any) => {
      const quantity = toNumber(service.quantity ?? service.hours, 1);
      const price = toNumber(service.unitPrice ?? service.price);
      return {
        id: service.id,
        name: service.name,
        description: service.description,
        quantity,
        price,
        total: toNumber(service.lineTotal, quantity * price),
      };
    });
  }

  if (invoice.project?.serviceProject?.length) {
    return invoice.project.serviceProject.map((service: any) => {
      const quantity = toNumber(service.hours, 1);
      const price = toNumber(service.price);
      return {
        id: service.id,
        name: service.name,
        description: service.description,
        quantity,
        price,
        total: quantity * price,
      };
    });
  }

  return [];
}

function getTargetTotal(invoice: any) {
  if (invoice.type_invoicebase === "estimate" && invoice.estimate) {
    const estimateServicesTotal = (invoice.estimate.serviceProjects || []).reduce(
      (sum: number, service: any) => sum + toNumber(service.lineTotal),
      0
    );

    return toNumber(
      invoice.estimate.finalAmount ?? invoice.estimate.totalAmount,
      estimateServicesTotal || toNumber(invoice.totalAmount)
    );
  }

  const projectServicesTotal = (invoice.project?.serviceProject || []).reduce(
    (sum: number, service: any) => sum + toNumber(service.hours, 1) * toNumber(service.price),
    0
  );

  return projectServicesTotal || toNumber(invoice.project?.price, toNumber(invoice.totalAmount));
}

async function getAmountPaidAfterPayment(invoice: any) {
  const paidWhere =
    invoice.type_invoicebase === "estimate" && invoice.estimateId
      ? { estimateId: invoice.estimateId, status: { in: ["paid", "partial"] } }
      : { projectId: invoice.projectId, status: { in: ["paid", "partial"] } };

  const paidInvoices = await prisma.invoice.findMany({
    where: paidWhere,
    select: {
      id: true,
      status: true,
      invoiceType: true,
      totalAmount: true,
      totalAmountPaidQbo: true,
      paymentApplications: {
        select: {
          amountApplied: true,
        },
      },
    },
  });

  return paidInvoices.reduce((sum, paidInvoice) => {
    return sum + invoicePaymentAppliedAmount(paidInvoice);
  }, 0);
}

function getPaymentAmount(invoice: any, options: GeneratePaidInvoicePdfOptions) {
  if (typeof options.paymentAmount === "number" && Number.isFinite(options.paymentAmount)) {
    return options.paymentAmount;
  }

  const paymentApplicationsTotal = (invoice.paymentApplications || []).reduce(
    (sum: number, application: any) => sum + toNumber(application.amountApplied),
    0
  );

  return (
    toNumber(invoice.payment?.amount) ||
    paymentApplicationsTotal ||
    toNumber(invoice.totalAmount)
  );
}

async function getCompanyLogoUrl(company: any) {
  if (!company?.avatar) return "";

  try {
    return await getPresignedUrl(company.avatar);
  } catch (error) {
    console.warn("[PaidInvoicePdf] Failed to sign company logo URL:", error);
    return "";
  }
}

function buildPaidInvoiceHtml(input: {
  invoice: any;
  company: any;
  client: any;
  workContext: any;
  companyLogoUrl: string;
  services: Array<{
    id: string;
    name: string;
    description?: string | null;
    quantity: number;
    price: number;
    total: number;
  }>;
  paymentTimeline: any[];
  paymentAmount: number;
  paymentMethod?: string | null;
  targetTotal: number;
  amountPaidAfterPayment: number;
  remainingBalance: number;
  paidAt?: Date | string | null;
}) {
  const invoice = input.invoice;
  const invoiceNumber = invoice.externalInvoiceId || invoice.id;
  const project = invoice.project || invoice.estimate?.project;
  const billToAddress =
    input.client?.location ||
    project?.location ||
    input.workContext?.location ||
    input.workContext?.addressOffice ||
    "";
  const clientName = input.client?.name || input.workContext?.Name || "Client";
  const clientEmail = input.client?.email || input.workContext?.Email || "";
  const clientPhone = input.client?.phone || input.workContext?.phone || "";
  const paymentMethodLabel =
    invoice.invoiceType === "stripe"
      ? "Stripe"
      : invoice.invoiceType === "quickbooks"
        ? "QuickBooks"
        : "Other";

  const serviceRows = input.services
    .map((service, index) => {
      const description = sanitizeDescriptionHtml(service.description);
      const border = index < input.services.length - 1 ? "border-bottom:1px solid #f1f3f4;" : "";

      return `
        <div class="service-row" style="${border}">
          <div class="service-main">
            <div class="service-name">${escapeHtml(service.name)}</div>
            <div class="service-quantity">${escapeHtml(service.quantity)}</div>
            <div class="service-price">${money(service.price)}</div>
            <div class="service-total">${money(service.total)}</div>
          </div>
          ${
            description
              ? `<div class="service-description">${description}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  const paymentHistory = input.paymentTimeline
    .sort((a, b) => new Date(a.date_creation).getTime() - new Date(b.date_creation).getTime())
    .map((timeline) => `<div class="history-item">${escapeHtml(timeline.description)}</div>`)
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          @page { size: A4; margin: 20px; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #ffffff;
            color: #333333;
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 12px;
            line-height: 1.4;
          }
          .page { width: 100%; background: #fff; position: relative; }
          .paid-watermark {
            position: absolute;
            top: 285px;
            left: 0;
            right: 0;
            pointer-events: none;
            z-index: 9999;
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 200px;
            font-weight: 900;
            opacity: 0.10;
            color: #22c55e;
            letter-spacing: 32px;
            text-transform: uppercase;
          }
          .header {
            padding: 24px;
            border-bottom: 1px solid #e5e7eb;
            display: flex;
            justify-content: space-between;
            gap: 24px;
            position: relative;
            z-index: 2;
          }
          .brand { display: flex; align-items: flex-start; gap: 20px; }
          .logo { max-height: 48px; max-width: 140px; object-fit: contain; }
          .company-name { font-size: 20px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px; }
          .muted { color: #6b7280; }
          .invoice-box {
            text-align: right;
            padding: 22px 24px;
            background: #f8f9fa;
            border-radius: 8px;
            border: 1px solid #e9ecef;
            min-width: 210px;
          }
          .invoice-title { font-size: 14px; font-weight: 600; color: #374151; margin-bottom: 8px; letter-spacing: 0.5px; }
          .info-grid {
            padding: 24px;
            display: grid;
            grid-template-columns: 1fr 300px;
            gap: 40px;
            position: relative;
            z-index: 2;
          }
          .card {
            background: #ffffff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 16px;
          }
          .label {
            font-size: 12px;
            font-weight: 600;
            color: #374151;
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .person { font-size: 16px; font-weight: 600; color: #1a1a1a; margin-bottom: 12px; }
          .balance-box {
            background: #374151;
            color: white;
            padding: 16px;
            border-radius: 6px;
            text-align: center;
            margin-bottom: 16px;
          }
          .balance-label { font-size: 10px; opacity: 0.8; margin-bottom: 4px; }
          .balance-amount { font-size: 16px; font-weight: 600; }
          .paid-line {
            display: flex;
            justify-content: space-between;
            margin-bottom: 12px;
            padding: 8px;
            background: #f0fdf4;
            border-radius: 4px;
            border: 1px solid #bbf7d0;
            color: #15803d;
            font-size: 11px;
            font-weight: 600;
          }
          .summary-line {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-top: 1px solid #e5e7eb;
            color: #374151;
            font-size: 11px;
          }
          .services-section {
            padding: 24px;
            break-inside: auto;
            page-break-inside: auto;
            position: relative;
            z-index: 2;
          }
          .section-title {
            font-size: 14px;
            font-weight: 600;
            color: #1a1a1a;
            margin: 0 0 16px 0;
            letter-spacing: 0.5px;
          }
          .table-head {
            display: grid;
            grid-template-columns: 3fr 1fr 1.2fr 1.2fr;
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px 6px 0 0;
            padding: 12px 16px;
            font-size: 11px;
            font-weight: 600;
            color: #374151;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .services-table {
            border: 1px solid #e9ecef;
            border-top: none;
            border-radius: 0 0 6px 6px;
            background: #ffffff;
          }
          .service-row { break-inside: auto; page-break-inside: auto; }
          .service-main {
            display: grid;
            grid-template-columns: 3fr 1fr 1.2fr 1.2fr;
            align-items: center;
            padding: 16px;
            min-height: 50px;
          }
          .service-name { font-size: 12px; font-weight: 600; color: #1a1a1a; padding-right: 16px; }
          .service-quantity { text-align: center; font-size: 11px; color: #374151; padding-right: 16px; }
          .service-price { text-align: right; font-size: 11px; color: #374151; padding-right: 16px; }
          .service-total { text-align: right; font-size: 12px; font-weight: 600; color: #1a1a1a; }
          .service-description {
            margin: 0 16px 16px 16px;
            font-size: 10px;
            color: #6b7280;
            line-height: 1.5;
            background: #f8f9fa;
            padding: 12px;
            border-radius: 4px;
            border: 1px solid #e9ecef;
            word-break: break-word;
            overflow-wrap: anywhere;
          }
          .service-description p { margin: 0 0 8px 0; }
          .service-description strong,
          .service-description b { font-weight: 700; color: #4b5563; }
          .service-description em,
          .service-description i { font-style: italic; }
          .service-description ul,
          .service-description ol { margin: 0 0 8px 18px; padding: 0; }
          .service-description li { margin-bottom: 4px; }
          .totals {
            margin-top: 24px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            display: flex;
            justify-content: flex-end;
            break-inside: avoid;
          }
          .totals-card { text-align: right; padding: 24px; min-width: 260px; }
          .payment-label { color: #15803d; font-size: 11px; font-weight: 600; margin-bottom: 4px; }
          .payment-amount { color: #15803d; font-size: 12px; font-weight: 700; }
          .remaining-label {
            font-size: 11px;
            color: #6b7280;
            margin: 8px 0 4px 0;
            font-weight: 600;
            padding-top: 8px;
            border-top: 1px solid #e5e7eb;
          }
          .remaining-amount { font-size: 14px; font-weight: 700; color: #1a1a1a; }
          .history { margin-top: 8px; padding-top: 8px; border-top: 1px solid #e5e7eb; }
          .history-title { font-size: 11px; color: #6b7280; margin-bottom: 8px; font-weight: 600; }
          .history-item {
            font-size: 9px;
            color: #4b5563;
            margin-bottom: 4px;
            padding-left: 8px;
            border-left: 2px solid #e5e7eb;
            text-align: left;
          }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="paid-watermark">PAID</div>
          <div class="header">
            <div class="brand">
              ${input.companyLogoUrl ? `<img class="logo" src="${escapeHtml(input.companyLogoUrl)}" />` : ""}
              <div>
                <div class="company-name">${escapeHtml(input.company?.name || "Company Name")}</div>
                <div class="muted">
                  ${input.company?.address ? `<div>${escapeHtml(input.company.address)}</div>` : ""}
                  ${input.company?.phone ? `<div>${escapeHtml(input.company.phone)}</div>` : ""}
                  ${input.company?.email ? `<div>${escapeHtml(input.company.email)}</div>` : ""}
                </div>
              </div>
            </div>
            <div class="invoice-box">
              <div class="invoice-title">INVOICE #${escapeHtml(invoiceNumber)}</div>
              <div class="muted">Date: ${dateLabel(invoice.createdAt)}</div>
              <div class="muted">Due: ${dateLabel(invoice.dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}</div>
            </div>
          </div>

          <div class="info-grid">
            <div>
              <div class="card">
                <div class="label">Bill To</div>
                <div class="person">${escapeHtml(clientName)}</div>
                <div class="muted">
                  ${billToAddress ? `<div>${escapeHtml(billToAddress)}</div>` : ""}
                  ${clientPhone ? `<div>${escapeHtml(clientPhone)}</div>` : ""}
                  ${clientEmail ? `<div>${escapeHtml(clientEmail)}</div>` : ""}
                </div>
              </div>
            </div>

            <div class="card">
              <div class="label">Invoice Details</div>
              <div class="summary-line" style="border-top:none;">
                <span>Payment Method:</span>
                <strong>${escapeHtml(paymentMethodLabel)}</strong>
              </div>
              <div class="summary-line">
                <span>Supervisor:</span>
                <strong>${escapeHtml(input.company?.name || "Project Manager")}</strong>
              </div>
              <div class="balance-box">
                <div class="balance-label">BALANCE DUE</div>
                <div class="balance-amount">${money(input.paymentAmount)}</div>
              </div>
              <div class="paid-line">
                <span>Payment:</span>
                <span>-${money(input.paymentAmount)}</span>
              </div>
            </div>
          </div>

          <div class="services-section">
            <h2 class="section-title">SERVICES</h2>
            <div class="table-head">
              <div>Service</div>
              <div style="text-align:center;">Quantity</div>
              <div style="text-align:right;">Unit Price</div>
              <div style="text-align:right;">Amount</div>
            </div>
            <div class="services-table">
              ${serviceRows || `<div style="padding:16px;color:#6b7280;">No services found for this invoice.</div>`}
            </div>

            <div class="totals">
              <div class="totals-card">
                <div class="payment-label">Payment</div>
                <div class="payment-amount">-${money(input.paymentAmount)}</div>
                <div class="remaining-label">Remaining Balance</div>
                <div class="remaining-amount">${money(input.remainingBalance)}</div>
                ${
                  paymentHistory
                    ? `<div class="history"><div class="history-title">Payment History</div>${paymentHistory}</div>`
                    : ""
                }
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
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
      margin: "20px",
      use_print: true,
      disable_javascript: true,
    },
    {
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/pdf",
      },
      responseType: "arraybuffer",
      timeout: Number(process.env.PDFSHIFT_TIMEOUT_MS || 90000),
    }
  );

  return Buffer.from(response.data);
}

async function uploadPdfBuffer(pdfBuffer: Buffer, fileName: string) {
  const tempDir = path.join(os.tmpdir(), "smartbuild-paid-invoices");
  fs.mkdirSync(tempDir, { recursive: true });

  const tempFilePath = path.join(tempDir, `${crypto.randomBytes(8).toString("hex")}-${fileName}`);
  fs.writeFileSync(tempFilePath, pdfBuffer);

  const multerFile = {
    fieldname: "file",
    originalname: fileName,
    encoding: "7bit",
    mimetype: "application/pdf",
    destination: tempDir,
    filename: path.basename(tempFilePath),
    path: tempFilePath,
    size: pdfBuffer.length,
  } as Express.Multer.File;

  return uploadFileToS3_2(multerFile, "");
}

export async function generateAndStorePaidInvoicePdf(
  invoiceId: string,
  options: GeneratePaidInvoicePdfOptions = {}
): Promise<PaidInvoicePdfResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      InvoiceItems: true,
      payment: true,
      paymentApplications: {
        include: {
          paymentTransaction: true,
        },
      },
      pdfInvoicePaids: true,
      company: true,
      project: {
        include: {
          company: true,
          client: true,
          workContext: true,
          serviceProject: {
            orderBy: [{ date_creation: "asc" }, { id: "asc" }],
          },
          InvoicePaymentTimeLine: {
            orderBy: { date_creation: "asc" },
          },
        },
      },
      estimate: {
        include: {
          serviceProjects: {
            orderBy: [{ pos: "asc" }, { date_creation: "asc" }, { id: "asc" }],
          },
          InvoicePaymentTimeLine: {
            orderBy: { date_creation: "asc" },
          },
          project: {
            include: {
              company: true,
              client: true,
              workContext: true,
              serviceProject: {
                orderBy: [{ date_creation: "asc" }, { id: "asc" }],
              },
            },
          },
        },
      },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const project = invoice.project || invoice.estimate?.project;
  const company = invoice.company || project?.company;
  const client = project?.client;
  const workContext = project?.workContext;
  const services = getInvoiceLineItems(invoice);
  const targetTotal = getTargetTotal(invoice);
  const amountPaidAfterPayment = await getAmountPaidAfterPayment(invoice);
  const remainingBalance = Math.max(0, targetTotal - amountPaidAfterPayment);
  const paymentAmount = getPaymentAmount(invoice, options);
  const companyLogoUrl = await getCompanyLogoUrl(company);
  const paymentTimeline =
    invoice.type_invoicebase === "estimate"
      ? invoice.estimate?.InvoicePaymentTimeLine || []
      : invoice.project?.InvoicePaymentTimeLine || [];

  const html = buildPaidInvoiceHtml({
    invoice,
    company,
    client,
    workContext,
    companyLogoUrl,
    services,
    paymentTimeline,
    paymentAmount,
    paymentMethod: options.paymentMethod,
    targetTotal,
    amountPaidAfterPayment,
    remainingBalance,
    paidAt: options.paidAt || invoice.payment?.paidAt || invoice.lastPaymentAt || new Date(),
  });

  const pdfBuffer = await generatePdfBuffer(html);
  const invoiceNumber = invoice.externalInvoiceId || invoice.id;
  const fileName = `invoice_paid_${String(invoiceNumber).replace(/[^\w.-]/g, "_")}.pdf`;
  const newS3Key = await uploadPdfBuffer(pdfBuffer, fileName);

  if (invoice.pdfInvoicePaids?.uri) {
    try {
      await deleteFileFromS3(invoice.pdfInvoicePaids.uri);
    } catch (error) {
      console.warn("[PaidInvoicePdf] Failed to delete previous paid PDF:", error);
    }
  }

  const pdfInvoicePaid = invoice.pdfInvoicePaids
    ? await prisma.pdfInvoicePaid.update({
        where: { id: invoice.pdfInvoicePaids.id },
        data: {
          original_file_name: fileName,
          uri: newS3Key,
        },
      })
    : await prisma.pdfInvoicePaid.create({
        data: {
          original_file_name: fileName,
          uri: newS3Key,
          invoiceId: invoice.id,
        },
      });

  const attachment: PaidInvoiceAttachment = {
    filename: fileName,
    content: pdfBuffer.toString("base64"),
    type: "application/pdf",
    disposition: "attachment",
  };

  console.log("[PaidInvoicePdf] Regenerated paid invoice PDF", {
    invoiceId: invoice.id,
    invoiceNumber,
    targetTotal,
    amountPaidAfterPayment,
    remainingBalance,
    paymentAmount,
    s3Key: newS3Key,
  });

  return {
    pdfInvoicePaid,
    pdfBuffer,
    fileName,
    attachment,
    summary: {
      invoiceId: invoice.id,
      invoiceNumber: String(invoiceNumber),
      targetTotal,
      amountPaidAfterPayment,
      remainingBalance,
      paymentAmount,
    },
  };
}
