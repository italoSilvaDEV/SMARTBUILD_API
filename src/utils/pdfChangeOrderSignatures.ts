import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const MARGIN_LEFT = 48;
const SIGNATURE_LINE_Y = 50;
const SIGNATURE_CONTENT_Y = 55;
const SIGNATURE_WIDTH = 100;
const SIGNATURE_HEIGHT = 35;

const DATE_FONT_SIZE = 8;
const NAME_SIZE = 10;
const DISCLAIMER_FONT_SIZE = 7;
const DATE_COLOR = rgb(0.5, 0.5, 0.5);
const LINE_HEIGHT = 14;

function getLastPage(pages: ReturnType<PDFDocument["getPages"]>) {
  if (pages.length === 0) return null;
  return pages[pages.length - 1];
}

export async function addManualApprovalClientSignatureToChangeOrderPdfBuffer(
  pdfBuffer: Buffer,
  clientName: string,
  date: Date
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const page = getLastPage(pages);
  if (!page) return pdfBuffer;

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

  let y = SIGNATURE_CONTENT_Y;

  page.drawText(approvedText, {
    x: MARGIN_LEFT,
    y,
    size: DATE_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });
  y += LINE_HEIGHT;

  page.drawText(clientName, {
    x: MARGIN_LEFT,
    y,
    size: NAME_SIZE,
    font: italicFont,
    color: rgb(0, 0, 0),
  });
  y += LINE_HEIGHT;

  page.drawText(disclaimerText, {
    x: MARGIN_LEFT,
    y,
    size: DISCLAIMER_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const REMOVE_RECT_X = MARGIN_LEFT;
const REMOVE_RECT_Y = 38;
const REMOVE_RECT_WIDTH = 210;
const REMOVE_RECT_HEIGHT = 95;

export async function removeManualClientSignatureFromChangeOrderPdfBuffer(
  pdfBuffer: Buffer
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const page = getLastPage(pages);
  if (!page) return pdfBuffer;

  const white = rgb(1, 1, 1);

  page.drawRectangle({
    x: REMOVE_RECT_X,
    y: REMOVE_RECT_Y,
    width: REMOVE_RECT_WIDTH,
    height: REMOVE_RECT_HEIGHT,
    color: white,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

export const CHANGE_ORDER_SIGNATURE_LAST_PAGE = {
  x: MARGIN_LEFT,
  y: SIGNATURE_CONTENT_Y,
  width: SIGNATURE_WIDTH,
  height: SIGNATURE_HEIGHT,
} as const;
