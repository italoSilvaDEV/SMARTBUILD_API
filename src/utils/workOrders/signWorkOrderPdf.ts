import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { findWorkOrderAssigneeSignature } from "./findWorkOrderSignature";

const SIGNATURE_MAX_WIDTH = 100;
const SIGNATURE_MAX_HEIGHT = 45;

export async function signWorkOrderPdf(source: Buffer, signature: string, signedAt: Date): Promise<Buffer> {
  const pdf = await PDFDocument.load(source);
  const pages = pdf.getPages();
  const position = await findWorkOrderAssigneeSignature(source);
  const page = position ? pages[position.pageIndex] : pages[pages.length - 1];
  if (!page) throw new Error("Work order PDF has no pages");

  const base64 = signature.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  const bytes = Buffer.from(base64, "base64");
  let image;
  try { image = await pdf.embedPng(bytes); }
  catch { image = await pdf.embedJpg(bytes); }

  const scale = Math.min(SIGNATURE_MAX_WIDTH / image.width, SIGNATURE_MAX_HEIGHT / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = position?.x ?? 48;
  const y = position?.y ?? 68;
  page.drawImage(image, { x, y, width, height });

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(`Signed on: ${signedAt.toLocaleString("en-US", { timeZone: "America/New_York" })}`, {
    x,
    y: 55,
    size: 7,
    font,
    color: rgb(0.45, 0.45, 0.48),
  });

  return Buffer.from(await pdf.save());
}
