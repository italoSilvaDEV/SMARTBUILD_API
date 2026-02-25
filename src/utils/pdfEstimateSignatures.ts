import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const MARGIN = 50;
const COMPANY_NAME_FONT_SIZE = 10;
const DATE_FONT_SIZE = 8;
const DATE_COLOR = rgb(0.5, 0.5, 0.5);

export async function addCompanySignatureToPdfBuffer(
  pdfBuffer: Buffer,
  companyName: string,
  date: Date
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);

  const formattedDate = date.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "America/New_York",
  });

  const SIGNATURE_BOTTOM_MARGIN = 45;

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const y = SIGNATURE_BOTTOM_MARGIN;

    page.drawText(companyName, {
      x: MARGIN,
      y,
      size: COMPANY_NAME_FONT_SIZE,
      font,
      color: rgb(0, 0, 0),
    });

    page.drawText(`Signed on: ${formattedDate}`, {
      x: MARGIN,
      y: y - 15,
      size: DATE_FONT_SIZE,
      font: await pdfDoc.embedFont(StandardFonts.Helvetica),
      color: DATE_COLOR,
    });
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const CLIENT_SIGNATURE_MARGIN = 50;
const CLIENT_SIGNATURE_BOTTOM = 45;
const CLIENT_SIGNATURE_WIDTH = 100;
const CLIENT_SIGNATURE_HEIGHT = 50;

export async function addClientSignatureImageToPdfBuffer(
  pdfBuffer: Buffer,
  signatureBase64: string
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const base64Data = signatureBase64.replace(/^data:image\/[a-z]+;base64,/, "");
  const signatureBuffer = Buffer.from(base64Data, "base64");

  let signatureImage;
  try {
    signatureImage = await pdfDoc.embedPng(signatureBuffer);
  } catch {
    signatureImage = await pdfDoc.embedJpg(signatureBuffer);
  }

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

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const x = width - CLIENT_SIGNATURE_WIDTH - CLIENT_SIGNATURE_MARGIN;
    const y = CLIENT_SIGNATURE_BOTTOM;

    page.drawImage(signatureImage, {
      x,
      y,
      width: CLIENT_SIGNATURE_WIDTH,
      height: CLIENT_SIGNATURE_HEIGHT,
    });
    page.drawText(`Signed on: ${formattedDate}`, {
      x,
      y: y - 15,
      size: DATE_FONT_SIZE,
      font: helveticaFont,
      color: DATE_COLOR,
    });
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const MARGIN_RIGHT = 50;
const SIGNATURE_BOTTOM_MARGIN_CLIENT = 45;
const DISCLAIMER_FONT_SIZE = 7;

export async function addManualApprovalClientSignatureToPdfBuffer(
  pdfBuffer: Buffer,
  clientName: string,
  date: Date
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
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

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    let y = SIGNATURE_BOTTOM_MARGIN_CLIENT;

    const nameWidth = italicFont.widthOfTextAtSize(clientName, nameSize);
    const dateWidth = helveticaFont.widthOfTextAtSize(approvedText, dateSize);
    const disclaimerWidth = helveticaFont.widthOfTextAtSize(disclaimerText, DISCLAIMER_FONT_SIZE);

    page.drawText(clientName, {
      x: width - MARGIN_RIGHT - nameWidth,
      y,
      size: nameSize,
      font: italicFont,
      color: rgb(0, 0, 0),
    });
    y -= 14;

    page.drawText(approvedText, {
      x: width - MARGIN_RIGHT - dateWidth,
      y,
      size: dateSize,
      font: helveticaFont,
      color: DATE_COLOR,
    });
    y -= 12;

    page.drawText(disclaimerText, {
      x: width - MARGIN_RIGHT - disclaimerWidth,
      y,
      size: DISCLAIMER_FONT_SIZE,
      font: helveticaFont,
      color: DATE_COLOR,
    });
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const MANUAL_SIGNATURE_RECT_WIDTH = 320;
const MANUAL_SIGNATURE_RECT_HEIGHT = 52;
const MANUAL_SIGNATURE_RECT_BOTTOM = 8;

export async function removeManualClientSignatureFromPdfBuffer(pdfBuffer: Buffer): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const white = rgb(1, 1, 1);

  for (let i = 1; i < pages.length; i++) {
    const page = pages[i];
    const { width } = page.getSize();
    const x = width - MANUAL_SIGNATURE_RECT_WIDTH - MARGIN_RIGHT;
    const y = MANUAL_SIGNATURE_RECT_BOTTOM;

    page.drawRectangle({
      x,
      y,
      width: MANUAL_SIGNATURE_RECT_WIDTH,
      height: MANUAL_SIGNATURE_RECT_HEIGHT,
      color: white,
    });
  }

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}
