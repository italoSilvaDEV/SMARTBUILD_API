import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const SIGNATURE_X = 95;
const SIGNATURE_Y_BOTTOM = 625;

const DATE_FONT_SIZE = 8;
const NAME_SIZE = 10;
const DISCLAIMER_FONT_SIZE = 7;
const DATE_COLOR = rgb(0.5, 0.5, 0.5);
const LINE_HEIGHT = 14;

export async function addManualApprovalClientSignatureToChangeOrderPdfBuffer(
  pdfBuffer: Buffer,
  clientName: string,
  date: Date
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return pdfBuffer;

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

  const page = pages[0];
  let y = SIGNATURE_Y_BOTTOM;

  page.drawText(approvedText, {
    x: SIGNATURE_X,
    y,
    size: DATE_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });
  y += LINE_HEIGHT;

  page.drawText(clientName, {
    x: SIGNATURE_X,
    y,
    size: NAME_SIZE,
    font: italicFont,
    color: rgb(0, 0, 0),
  });
  y += LINE_HEIGHT;

  page.drawText(disclaimerText, {
    x: SIGNATURE_X,
    y,
    size: DISCLAIMER_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

const REMOVE_RECT_X = 90;
const REMOVE_RECT_Y = 618;
const REMOVE_RECT_WIDTH = 130;
const REMOVE_RECT_HEIGHT = 55;

export async function removeManualClientSignatureFromChangeOrderPdfBuffer(
  pdfBuffer: Buffer
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) return pdfBuffer;

  const white = rgb(1, 1, 1);
  const page = pages[0];

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
