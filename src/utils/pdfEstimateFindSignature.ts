const pdfjsLib = require("pdfjs-dist/build/pdf.js");

const COMPANY_LABEL = "company signature";
const CLIENT_LABELS: { label: string; firstWord: string }[] = [
  { label: "customer signature", firstWord: "customer" },
  { label: "client signature", firstWord: "client" },
];
const GAP_ABOVE_LABEL = 40;

const LINE_ABOVE_LABEL = 6;

export interface SignaturePosition {
  pageIndex: number;
  x: number;
  y: number;
  lineY?: number;
}

export interface EstimateSignaturePositions {
  company: SignaturePosition | null;
  client: SignaturePosition | null;
}

const isPdfFontWarning = (msg: unknown) =>
  typeof msg === "string" && msg.includes("fetchStandardFontData");

function suppressPdfFontWarnings<T>(fn: () => Promise<T>): Promise<T> {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (args.some(isPdfFontWarning)) return;
    origWarn.apply(console, args);
  };
  return fn().finally(() => {
    console.warn = origWarn;
  });
}

function findLabelInItems(
  items: Array<{ str?: string; transform?: number[]; width?: number; height?: number }>,
  label: string,
  firstWord: string
): SignaturePosition | null {
  let combined = "";
  for (let i = 0; i < items.length; i++) {
    const str = items[i].str ?? "";
    combined += str;
    if (combined.toLowerCase().includes(label)) {
      const firstItem = items.slice(0, i + 1).find(
        (it) => (it.str ?? "").toLowerCase().includes(firstWord)
      ) ?? items[i];
      const tr = firstItem.transform;
      if (tr) {
        const x = tr[4];
        const y = tr[5];
        const height = typeof firstItem.height === "number" ? firstItem.height : 12;
        const labelTop = y + height;
        return {
          pageIndex: 0,
          x,
          y: labelTop + GAP_ABOVE_LABEL,
          lineY: labelTop + LINE_ABOVE_LABEL,
        };
      }
      return null;
    }
  }
  return null;
}

export async function findEstimateSignaturePositions(
  pdfBuffer: Buffer
): Promise<EstimateSignaturePositions> {
  try {
    return await suppressPdfFontWarnings(async () => {
      const lib = pdfjsLib as { disableWorker?: boolean };
      lib.disableWorker = true;
      const data = new Uint8Array(pdfBuffer);
      const loadingTask = pdfjsLib.getDocument({
        data,
        disableFontFace: true,
        useSystemFonts: false,
        verbosity: 0,
      });
      const pdf = await loadingTask.promise;
      const numPages = pdf.numPages;
      let company: SignaturePosition | null = null;
      let client: SignaturePosition | null = null;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const content = await page.getTextContent();
        const items = content.items as Array<{
          str?: string;
          transform?: number[];
          width?: number;
          height?: number;
        }>;

        if (!company) {
          const pos = findLabelInItems(items, COMPANY_LABEL, "company");
          if (pos) company = { ...pos, pageIndex: pageNum - 1 };
        }
        if (!client) {
          for (const { label, firstWord } of CLIENT_LABELS) {
            const pos = findLabelInItems(items, label, firstWord);
            if (pos) {
              client = { ...pos, pageIndex: pageNum - 1 };
              break;
            }
          }
        }
        if (company && client) break;
      }

      return { company, client };
    });
  } catch (err) {
    console.error("[findEstimateSignaturePositions]", err);
    return { company: null, client: null };
  }
}
