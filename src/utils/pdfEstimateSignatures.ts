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
