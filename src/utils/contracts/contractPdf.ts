import crypto from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import { getPresignedUrl } from "../S3/getPresignedUrl";

export type ContractSignerValue = "company" | "client";
export type ContractFieldTypeValue = "signature" | "signature_date";

export interface ContractFieldRender {
  id?: string;
  signer: ContractSignerValue;
  type: ContractFieldTypeValue;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dateValue?: Date | string | null;
}

export interface ContractDocumentRender {
  id: string;
  originalFileName?: string | null;
  uri: string;
  preparedUri?: string | null;
  fields: ContractFieldRender[];
}

export interface ContractPdfContext {
  companyName: string;
  companySignature?: string | null;
  companySignatureText?: string | null;
  clientName: string;
  signedAt?: Date;
}

interface StampOptions {
  includeClientSignature: boolean;
  clientSignature?: string | null;
  clientSignatureText?: string | null;
  drawClientPlaceholders?: boolean;
  clearClientFields?: boolean;
}

const TEXT_COLOR = rgb(0.05, 0.05, 0.05);
const MUTED_COLOR = rgb(0.42, 0.42, 0.42);
const BORDER_COLOR = rgb(0.73, 0.61, 0.42);
const WHITE_COLOR = rgb(1, 1, 1);
const CLEAR_PADDING = 2;

interface PdfPageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^\w.\-]+/g, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatDate(value?: Date | string | null) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return safeDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

function getVisiblePageBox(page: any): PdfPageBox {
  const fallback = page.getSize();
  const cropBox = typeof page.getCropBox === "function" ? page.getCropBox() : null;

  if (cropBox && cropBox.width > 0 && cropBox.height > 0) {
    return cropBox;
  }

  return {
    x: 0,
    y: 0,
    width: fallback.width,
    height: fallback.height,
  };
}

function toPdfBox(field: ContractFieldRender, pageBox: PdfPageBox) {
  const width = clamp(field.width * pageBox.width, 24, pageBox.width);
  const height = clamp(field.height * pageBox.height, 14, pageBox.height);
  const x = clamp(pageBox.x + field.x * pageBox.width, pageBox.x, Math.max(pageBox.x, pageBox.x + pageBox.width - width));
  const yTop = clamp(field.y * pageBox.height, 0, pageBox.height);
  const y = clamp(
    pageBox.y + pageBox.height - yTop - height,
    pageBox.y,
    Math.max(pageBox.y, pageBox.y + pageBox.height - height)
  );
  return { x, y, width, height };
}

function drawFittedText(page: any, font: PDFFont, text: string, box: ReturnType<typeof toPdfBox>, italic = false) {
  const baseSize = italic ? 12 : 10;
  const minSize = 6;
  let size = Math.min(baseSize, Math.max(minSize, box.height * 0.45));
  while (size > minSize && font.widthOfTextAtSize(text, size) > box.width - 8) {
    size -= 0.5;
  }
  page.drawText(text, {
    x: box.x + 4,
    y: box.y + Math.max(3, (box.height - size) / 2),
    size,
    font,
    color: italic ? TEXT_COLOR : MUTED_COLOR,
  });
}

async function embedSignature(pdfDoc: PDFDocument, signatureData: string) {
  const base64Data = signatureData.replace(/^data:image\/[a-z]+;base64,/, "");
  const signatureBuffer = Buffer.from(base64Data, "base64");
  try {
    return await pdfDoc.embedPng(signatureBuffer);
  } catch {
    return pdfDoc.embedJpg(signatureBuffer);
  }
}

function looksLikeImageSignature(value?: string | null) {
  return Boolean(value && /^data:image\/[a-z]+;base64,/.test(value));
}

function clearStampedField(page: any, box: ReturnType<typeof toPdfBox>) {
  page.drawRectangle({
    x: box.x - CLEAR_PADDING,
    y: box.y - CLEAR_PADDING,
    width: box.width + CLEAR_PADDING * 2,
    height: box.height + CLEAR_PADDING * 2,
    color: WHITE_COLOR,
  });
}

function normalizeSignatureText(value?: string | null) {
  return value?.trim() || "";
}

function flattenFillableFields(pdfDoc: PDFDocument) {
  try {
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    if (fields.length === 0) return;

    form.updateFieldAppearances();
    form.flatten();
  } catch (error) {
    console.warn("[contracts.pdf] Could not flatten PDF form fields before stamping", error);
  }
}

async function drawSignatureField(
  pdfDoc: PDFDocument,
  page: any,
  box: ReturnType<typeof toPdfBox>,
  field: ContractFieldRender,
  context: ContractPdfContext,
  options: StampOptions,
  fonts: { italic: PDFFont; regular: PDFFont }
) {
  if (field.signer === "company") {
    const companySignatureText = normalizeSignatureText(context.companySignatureText);
    if (companySignatureText) {
      drawFittedText(page, fonts.italic, companySignatureText, box, true);
      return;
    }

    if (looksLikeImageSignature(context.companySignature)) {
      const image = await embedSignature(pdfDoc, context.companySignature!);
      page.drawImage(image, {
        x: box.x + 2,
        y: box.y + 2,
        width: Math.max(1, box.width - 4),
        height: Math.max(1, box.height - 4),
      });
      return;
    }

    drawFittedText(page, fonts.italic, context.companyName || "Company", box, true);
    return;
  }

  const clientSignatureText = normalizeSignatureText(options.clientSignatureText);
  if (options.includeClientSignature && (clientSignatureText || options.clientSignature) && options.clearClientFields) {
    clearStampedField(page, box);
  }

  if (options.includeClientSignature && clientSignatureText) {
    drawFittedText(page, fonts.italic, clientSignatureText, box, true);
    return;
  }

  if (options.includeClientSignature && options.clientSignature) {
    const image = await embedSignature(pdfDoc, options.clientSignature);
    page.drawImage(image, {
      x: box.x + 2,
      y: box.y + 2,
      width: Math.max(1, box.width - 4),
      height: Math.max(1, box.height - 4),
    });
    return;
  }

  if (options.drawClientPlaceholders) {
    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      borderWidth: 1,
      borderColor: BORDER_COLOR,
    });
    drawFittedText(page, fonts.regular, "Customer signature", box);
  }
}

function drawDateField(
  page: any,
  box: ReturnType<typeof toPdfBox>,
  field: ContractFieldRender,
  context: ContractPdfContext,
  options: StampOptions,
  font: PDFFont
) {
  if (field.signer === "client" && !options.includeClientSignature && options.drawClientPlaceholders) {
    page.drawRectangle({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      borderWidth: 1,
      borderColor: BORDER_COLOR,
    });
    drawFittedText(page, font, "Signature date", box);
    return;
  }

  const value = field.signer === "client" ? context.signedAt : field.dateValue;
  if (field.signer === "client" && options.includeClientSignature && options.clearClientFields) {
    clearStampedField(page, box);
  }
  drawFittedText(page, font, formatDate(value), box);
}

export async function fetchContractPdfBuffer(uri: string) {
  const pdfUrl = /^https?:\/\//i.test(uri) ? uri : await getPresignedUrl(uri);
  const pdfResponse = await fetch(pdfUrl);
  if (!pdfResponse.ok) {
    throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
  }
  return Buffer.from(await pdfResponse.arrayBuffer());
}

export async function stampContractPdf(
  pdfBuffer: Buffer,
  fields: ContractFieldRender[],
  context: ContractPdfContext,
  options: StampOptions
) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  flattenFillableFields(pdfDoc);

  const pages = pdfDoc.getPages();
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    italic: await pdfDoc.embedFont(StandardFonts.TimesRomanItalic),
  };

  for (const field of fields) {
    const page = pages[field.pageNumber - 1];
    if (!page) continue;

    const box = toPdfBox(field, getVisiblePageBox(page));

    if (field.type === "signature") {
      await drawSignatureField(pdfDoc, page, box, field, context, options, fonts);
    } else {
      drawDateField(page, box, field, context, options, fonts.regular);
    }
  }

  return Buffer.from(await pdfDoc.save());
}

export async function uploadBufferToS3(buffer: Buffer, fileName: string, contentType = "application/pdf") {
  const s3 = new S3Client({
    region: process.env.AMAZON_S3_REGION,
    credentials: {
      accessKeyId: process.env.AMAZON_S3_KEY!,
      secretAccessKey: process.env.AMAZON_S3_SECRET!,
    },
  });

  const fileHash = crypto.randomBytes(8).toString("hex");
  const key = `${fileHash}-${sanitizeFileName(fileName)}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AMAZON_S3_BUCKET!,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return key;
}
