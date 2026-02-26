const pdfjsLib = require("pdfjs-dist/build/pdf.js");

const TARGET_LABEL = "customer signature";
const GAP_ABOVE_LABEL = 10;

export interface CustomerSignaturePosition {
  pageIndex: number;
  x: number;
  y: number;
}

export async function findCustomerSignaturePosition(
  pdfBuffer: Buffer
): Promise<CustomerSignaturePosition | null> {
  try {
    const lib = pdfjsLib as { disableWorker?: boolean; disableFontFace?: boolean };
    lib.disableWorker = true;
    lib.disableFontFace = true;
    const data = new Uint8Array(pdfBuffer);
    const loadingTask = pdfjsLib.getDocument({ data });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const items = content.items as Array<{
        str?: string;
        transform?: number[];
        width?: number;
        height?: number;
      }>;

      let combined = "";
      for (let i = 0; i < items.length; i++) {
        const str = items[i].str ?? "";
        combined += str;
        if (combined.toLowerCase().includes(TARGET_LABEL)) {
          const firstItemWithCustomer = items.slice(0, i + 1).find(
            (it) => (it.str ?? "").toLowerCase().includes("customer")
          ) ?? items[i];
          const tr = firstItemWithCustomer.transform;
          if (tr) {
            const x = tr[4];
            const y = tr[5];
            const height =
              typeof firstItemWithCustomer.height === "number"
                ? firstItemWithCustomer.height
                : 12;
            const ySignature = y + height + GAP_ABOVE_LABEL;
            return {
              pageIndex: pageNum - 1,
              x,
              y: ySignature,
            };
          }
          break;
        }
      }
    }

    return null;
  } catch (err) {
    console.error("[findCustomerSignaturePosition]", err);
    return null;
  }
}
