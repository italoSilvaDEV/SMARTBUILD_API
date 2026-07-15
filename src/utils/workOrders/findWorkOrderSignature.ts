const pdfjsLib = require("pdfjs-dist/build/pdf.js");

export interface WorkOrderSignaturePosition {
  pageIndex: number;
  x: number;
  y: number;
}

const LABELS = ["employee signature", "subcontractor signature"];

export async function findWorkOrderAssigneeSignature(pdfBuffer: Buffer): Promise<WorkOrderSignaturePosition | null> {
  const originalWarn = console.warn;
  try {
    console.warn = (...args: unknown[]) => {
      if (args.some((value) => typeof value === "string" && value.includes("fetchStandardFontData"))) return;
      originalWarn.apply(console, args);
    };
    pdfjsLib.disableWorker = true;
    const pdf = await pdfjsLib.getDocument({
      data: new Uint8Array(pdfBuffer),
      disableFontFace: true,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items as Array<{ str?: string; transform?: number[]; height?: number }>;
      for (const item of items) {
        const text = (item.str || "").trim().toLowerCase();
        if (!LABELS.some((label) => text.includes(label)) || !item.transform) continue;
        const labelTop = item.transform[5] + (typeof item.height === "number" ? item.height : 10);
        return { pageIndex: pageNumber - 1, x: item.transform[4], y: labelTop + 40 };
      }
    }
    return null;
  } catch (error) {
    console.error("[findWorkOrderAssigneeSignature]", error);
    return null;
  } finally {
    console.warn = originalWarn;
  }
}
