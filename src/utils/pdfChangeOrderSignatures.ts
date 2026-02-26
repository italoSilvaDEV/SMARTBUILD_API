import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { findCustomerSignaturePosition } from "./pdfChangeOrderFindSignature";

/** Fallback: rodapé da última página (quando "Customer signature" não é encontrado no PDF). */
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

function getPageAt(pages: ReturnType<PDFDocument["getPages"]>, pageIndex: number) {
  if (pageIndex < 0 || pageIndex >= pages.length) return null;
  return pages[pageIndex];
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

  const pos = await findCustomerSignaturePosition(pdfBuffer);
  const x = pos ? pos.x : MARGIN_LEFT;
  let y = pos ? pos.y : SIGNATURE_CONTENT_Y;
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : page;
  if (!targetPage) return pdfBuffer;

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

  targetPage.drawText(approvedText, {
    x,
    y,
    size: DATE_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });
  y += LINE_HEIGHT;

  targetPage.drawText(clientName, {
    x,
    y,
    size: NAME_SIZE,
    font: italicFont,
    color: rgb(0, 0, 0),
  });
  y += LINE_HEIGHT;

  targetPage.drawText(disclaimerText, {
    x,
    y,
    size: DISCLAIMER_FONT_SIZE,
    font: helveticaFont,
    color: DATE_COLOR,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

/** Largura da área da assinatura (manual ou imagem) */
const REMOVE_RECT_WIDTH = 210;
/** Altura só do bloco da assinatura (não incluir linha nem rótulo "Customer Signature" abaixo) */
const REMOVE_RECT_HEIGHT = 52;
/** Margem mínima abaixo do primeiro texto para não cortar; não descer até a linha */
const REMOVE_RECT_Y_MARGIN_BOTTOM = 2;

export async function removeManualClientSignatureFromChangeOrderPdfBuffer(
  pdfBuffer: Buffer
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const pages = pdfDoc.getPages();
  const page = getLastPage(pages);
  if (!page) return pdfBuffer;

  const pos = await findCustomerSignaturePosition(pdfBuffer);
  const targetPage = pos ? getPageAt(pages, pos.pageIndex) : page;
  if (!targetPage) return pdfBuffer;

  const rectX = pos ? pos.x : MARGIN_LEFT;
  const rectY = pos
    ? pos.y - REMOVE_RECT_Y_MARGIN_BOTTOM
    : SIGNATURE_CONTENT_Y - REMOVE_RECT_Y_MARGIN_BOTTOM;

  const white = rgb(1, 1, 1);
  targetPage.drawRectangle({
    x: rectX,
    y: rectY,
    width: REMOVE_RECT_WIDTH,
    height: REMOVE_RECT_HEIGHT,
    color: white,
  });

  const modifiedPdfBytes = await pdfDoc.save();
  return Buffer.from(modifiedPdfBytes);
}

/** Fallback quando "Customer signature" não é encontrado (última página, posição fixa). */
export const CHANGE_ORDER_SIGNATURE_LAST_PAGE = {
  x: MARGIN_LEFT,
  y: SIGNATURE_CONTENT_Y,
  width: SIGNATURE_WIDTH,
  height: SIGNATURE_HEIGHT,
} as const;

/**
 * Retorna a página (0-based) e (x, y) onde aplicar a assinatura: busca "Customer signature" no PDF
 * ou usa fallback (última página, coordenadas fixas).
 */
export async function getSignaturePositionForChangeOrder(
  pdfBuffer: Buffer,
  lastPageIndex: number
): Promise<{ pageIndex: number; x: number; y: number; width: number; height: number }> {
  const pos = await findCustomerSignaturePosition(pdfBuffer);
  if (pos) {
    return {
      pageIndex: pos.pageIndex,
      x: pos.x,
      y: pos.y,
      width: SIGNATURE_WIDTH,
      height: SIGNATURE_HEIGHT,
    };
  }
  return {
    pageIndex: lastPageIndex,
    x: CHANGE_ORDER_SIGNATURE_LAST_PAGE.x,
    y: CHANGE_ORDER_SIGNATURE_LAST_PAGE.y,
    width: CHANGE_ORDER_SIGNATURE_LAST_PAGE.width,
    height: CHANGE_ORDER_SIGNATURE_LAST_PAGE.height,
  };
}
