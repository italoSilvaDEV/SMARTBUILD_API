import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import { findEstimateSignaturePositions } from "./pdfEstimateFindSignature";

const MARGIN = 48;
const MARGIN_HORIZ = 96;
const GAP_BETWEEN_COLUMNS = 24;
const COMPANY_NAME_FONT_SIZE = 10;
const DATE_FONT_SIZE = 8;
const DATE_COLOR = rgb(0.5, 0.5, 0.5);
const SIGNATURE_TOP_MARGIN = 36;
const SIGNATURE_BOTTOM_MARGIN = 24;

function getCustomerBlockLeft(pageWidth: number): number {
  const contentWidth = pageWidth - MARGIN_HORIZ;
  return MARGIN + contentWidth / 2 + GAP_BETWEEN_COLUMNS;
}

function getLastPage(pages: ReturnType<PDFDocument["getPages"]>) {
  if (pages.length === 0) return null;
  return pages[pages.length - 1];
}

function getPageAt(pages: ReturnType<PDFDocument["getPages"]>, pageIndex: number) {
  if (pageIndex < 0 || pageIndex >= pages.length) return null;
  return pages[pageIndex];
}

const FALLBACK_SIGNATURE_Y = 45;

function clampSignatureY(
  page: PDFPage,
  desiredY: number,
  spaceAboveY: number,
  spaceBelowY: number
): number {
  const { height } = page.getSize();
  const maxY = height - SIGNATURE_TOP_MARGIN - spaceAboveY;
  const minY = SIGNATURE_BOTTOM_MARGIN + spaceBelowY;

  if (maxY < minY) {
    return Math.max(SIGNATURE_BOTTOM_MARGIN, Math.min(desiredY, maxY));
  }

  return Math.min(Math.max(desiredY, minY), maxY);
}

function wrapTextToLines(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = line + " " + words[i];
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i];
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function addCompanySignatureToPdfBuffer(
  pdfBuffer: Buffer,
  companyName: string,
  date: Date
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = getLastPage(pages);
  if (!lastPage) return pdfBuffer;

  const { company: pos } = await findEstimateSignaturePositions(pdfBuffer);
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : lastPage;
  if (!targetPage) return pdfBuffer;

  const x = MARGIN;
  const y = clampSignatureY(targetPage, pos ? pos.y : FALLBACK_SIGNATURE_Y, COMPANY_NAME_FONT_SIZE + 4, 32);

  const font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const formattedDate = date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });

  targetPage.drawText(companyName, {
    x,
    y,
    size: COMPANY_NAME_FONT_SIZE,
    font,
    color: rgb(0, 0, 0),
  });
  targetPage.drawText(`Signed on: ${formattedDate}`, {
    x,
    y: y - 15,
    size: DATE_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const COMPANY_SIGNATURE_WIDTH = 100;
const COMPANY_SIGNATURE_HEIGHT = 50;

export async function addCompanySignatureImageToPdfBuffer(
  pdfBuffer: Buffer,
  signatureBase64: string,
  companyName: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = getLastPage(pages);
  if (!lastPage) return pdfBuffer;

  const { company: pos } = await findEstimateSignaturePositions(pdfBuffer);
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : lastPage;
  if (!targetPage) return pdfBuffer;

  const x = MARGIN;
  const y = clampSignatureY(targetPage, pos ? pos.y : FALLBACK_SIGNATURE_Y, COMPANY_SIGNATURE_HEIGHT, 38);

  const base64Data = signatureBase64.replace(/^data:image\/[a-z]+;base64,/, "");
  const signatureBuffer = Buffer.from(base64Data, "base64");
  let signatureImage;
  try {
    signatureImage = await pdfDoc.embedPng(signatureBuffer);
  } catch {
    signatureImage = await pdfDoc.embedJpg(signatureBuffer);
  }

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const timesItalicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const formattedDate = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });

  targetPage.drawImage(signatureImage, {
    x,
    y,
    width: COMPANY_SIGNATURE_WIDTH,
    height: COMPANY_SIGNATURE_HEIGHT,
  });
  const nameY = y - 15;
  const signedOnY = nameY - 14;
  targetPage.drawText(companyName, {
    x,
    y: nameY,
    size: COMPANY_NAME_FONT_SIZE,
    font: timesItalicFont,
    color: rgb(0, 0, 0),
  });
  targetPage.drawText(`Signed on: ${formattedDate}`, {
    x,
    y: signedOnY,
    size: DATE_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const CLIENT_SIGNATURE_MARGIN = 50;
const CLIENT_SIGNATURE_WIDTH = 100;
const CLIENT_SIGNATURE_HEIGHT = 50;
const CLIENT_BLOCK_WIDTH = 240;

export async function addClientSignatureImageToPdfBuffer(
  pdfBuffer: Buffer,
  signatureBase64: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = getLastPage(pages);
  if (!lastPage) return pdfBuffer;

  const { client: pos } = await findEstimateSignaturePositions(pdfBuffer);
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : lastPage;
  if (!targetPage) return pdfBuffer;

  const { width } = targetPage.getSize();
  const clientBlockLeft = pos ? getCustomerBlockLeft(width) : width - CLIENT_SIGNATURE_WIDTH - CLIENT_SIGNATURE_MARGIN;

  const base64Data = signatureBase64.replace(/^data:image\/[a-z]+;base64,/, "");
  const signatureBuffer = Buffer.from(base64Data, "base64");
  let signatureImage;
  try {
    signatureImage = await pdfDoc.embedPng(signatureBuffer);
  } catch {
    signatureImage = await pdfDoc.embedJpg(signatureBuffer);
  }

  const maxSigWidth = Math.min(CLIENT_SIGNATURE_WIDTH, CLIENT_BLOCK_WIDTH);
  const scale = maxSigWidth / CLIENT_SIGNATURE_WIDTH;
  const drawWidth = CLIENT_SIGNATURE_WIDTH * scale;
  const drawHeight = CLIENT_SIGNATURE_HEIGHT * scale;

  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const formattedDate = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });
  const signedOnText = `Signed on: ${formattedDate}`;
  const signedOnLines = wrapTextToLines(helveticaFont, signedOnText, DATE_FONT_SIZE, CLIENT_BLOCK_WIDTH);
  const y = clampSignatureY(
    targetPage,
    pos ? pos.y : FALLBACK_SIGNATURE_Y,
    drawHeight,
    signedOnLines.length * 12 + 18
  );

  targetPage.drawImage(signatureImage, {
    x: clientBlockLeft,
    y,
    width: drawWidth,
    height: drawHeight,
  });

  let lineY = y - 15;
  for (const line of signedOnLines) {
    targetPage.drawText(line, {
      x: clientBlockLeft,
      y: lineY,
      size: DATE_FONT_SIZE,
      font: helveticaFont,
      color: DATE_COLOR,
    });
    lineY -= 12;
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const MARGIN_RIGHT = 50;
const DISCLAIMER_FONT_SIZE = 7;
const LINE_HEIGHT = 12;

export async function addManualApprovalClientSignatureToPdfBuffer(
  pdfBuffer: Buffer,
  clientName: string,
  date: Date
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = getLastPage(pages);
  if (!lastPage) return pdfBuffer;

  const { client: pos } = await findEstimateSignaturePositions(pdfBuffer);
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : lastPage;
  if (!targetPage) return pdfBuffer;

  const { width } = targetPage.getSize();
  const clientBlockLeft = pos ? getCustomerBlockLeft(width) : width - MARGIN_RIGHT - CLIENT_BLOCK_WIDTH;

  const italicFont = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const formattedDate = date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });

  const approvedText = `Signed on: ${formattedDate}`;
  const disclaimerText = "Authorized Internally for Estimate Purposes.";

  const nameSize = 10;
  const dateSize = DATE_FONT_SIZE;

  const nameLines = wrapTextToLines(italicFont, clientName, nameSize, CLIENT_BLOCK_WIDTH);
  const approvedLines = wrapTextToLines(helveticaFont, approvedText, dateSize, CLIENT_BLOCK_WIDTH);
  const disclaimerLines = wrapTextToLines(helveticaFont, disclaimerText, DISCLAIMER_FONT_SIZE, CLIENT_BLOCK_WIDTH);

  let y = clampSignatureY(
    targetPage,
    pos ? pos.y : FALLBACK_SIGNATURE_Y,
    nameSize + 4,
    nameLines.length * 14 + approvedLines.length * LINE_HEIGHT + disclaimerLines.length * LINE_HEIGHT + 6
  );

  for (const line of nameLines) {
    targetPage.drawText(line, {
      x: clientBlockLeft,
      y,
      size: nameSize,
      font: italicFont,
      color: rgb(0, 0, 0),
    });
    y -= 14;
  }
  for (const line of approvedLines) {
    targetPage.drawText(line, {
      x: clientBlockLeft,
      y,
      size: dateSize,
      font: helveticaFont,
      color: DATE_COLOR,
    });
    y -= LINE_HEIGHT;
  }
  for (const line of disclaimerLines) {
    targetPage.drawText(line, {
      x: clientBlockLeft,
      y,
      size: DISCLAIMER_FONT_SIZE,
      font: helveticaFont,
      color: DATE_COLOR,
    });
    y -= LINE_HEIGHT;
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

/** Altura do retângulo de assinatura manual quando não temos lineY (fallback). */
const MANUAL_SIGNATURE_RECT_HEIGHT_FALLBACK = 80;
const MANUAL_SIGNATURE_RECT_BOTTOM = 8;

const REAL_SIGNATURE_RECT_HEIGHT = CLIENT_SIGNATURE_HEIGHT + 30;

export async function removeManualClientSignatureFromPdfBuffer(pdfBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const lastPage = getLastPage(pages);
  if (!lastPage) return pdfBuffer;

  const { client: pos } = await findEstimateSignaturePositions(pdfBuffer);
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : lastPage;
  if (!targetPage) return pdfBuffer;

  const { width } = targetPage.getSize();
  const white = rgb(1, 1, 1);

  const clientBlockLeft = pos ? getCustomerBlockLeft(width) : width - MARGIN_RIGHT - CLIENT_BLOCK_WIDTH;

  const signatureY = pos ? pos.y : FALLBACK_SIGNATURE_Y;

  const manualRectBottom =
    pos?.lineY != null
      ? pos.lineY + 2
      : signatureY - MANUAL_SIGNATURE_RECT_HEIGHT_FALLBACK;
  const manualRectHeight =
    pos?.lineY != null ? signatureY - pos.lineY - 2 : MANUAL_SIGNATURE_RECT_HEIGHT_FALLBACK;

  targetPage.drawRectangle({
    x: clientBlockLeft,
    y: Math.max(MANUAL_SIGNATURE_RECT_BOTTOM, manualRectBottom),
    width: CLIENT_BLOCK_WIDTH,
    height: Math.max(20, manualRectHeight),
    color: white,
  });

  const realX = clientBlockLeft;
  const realY = signatureY - 20;
  targetPage.drawRectangle({
    x: realX,
    y: Math.max(0, realY),
    width: CLIENT_BLOCK_WIDTH,
    height: REAL_SIGNATURE_RECT_HEIGHT,
    color: white,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}
