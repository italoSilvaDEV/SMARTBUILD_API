import fs from "fs";
import path from "path";

export const DEFAULT_CONTRACT_SIGNATURE_FONT_KEY = "classic";

export const CONTRACT_SIGNATURE_FONTS = [
  {
    key: "classic",
    label: "Classic",
    fileName: null,
  },
  {
    key: "great_vibes",
    label: "Great Vibes",
    fileName: "great-vibes.ttf",
  },
  {
    key: "allura",
    label: "Allura",
    fileName: "allura.ttf",
  },
  {
    key: "parisienne",
    label: "Parisienne",
    fileName: "parisienne.ttf",
  },
  {
    key: "pacifico",
    label: "Pacifico",
    fileName: "pacifico.ttf",
  },
  {
    key: "sacramento",
    label: "Sacramento",
    fileName: "sacramento.ttf",
  },
  {
    key: "alex_brush",
    label: "Alex Brush",
    fileName: "alex-brush.ttf",
  },
] as const;

export type ContractSignatureFontKey = typeof CONTRACT_SIGNATURE_FONTS[number]["key"];

const FONT_BY_KEY = new Map(CONTRACT_SIGNATURE_FONTS.map((font) => [font.key, font]));

export function normalizeContractSignatureFontKey(value: unknown, fieldName = "Signature font") {
  const key = typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_CONTRACT_SIGNATURE_FONT_KEY;

  if (!FONT_BY_KEY.has(key as ContractSignatureFontKey)) {
    throw new Error(`${fieldName} is invalid`);
  }

  return key as ContractSignatureFontKey;
}

export function getContractSignatureFontDefinition(value?: string | null) {
  const key = typeof value === "string" && FONT_BY_KEY.has(value as ContractSignatureFontKey)
    ? (value as ContractSignatureFontKey)
    : DEFAULT_CONTRACT_SIGNATURE_FONT_KEY;

  return FONT_BY_KEY.get(key)!;
}

export function getContractSignatureFontPath(value?: string | null) {
  const definition = getContractSignatureFontDefinition(value);
  if (!definition.fileName) return null;

  const fontPath = path.resolve(process.cwd(), "public", "fonts", "signatures", definition.fileName);
  return fs.existsSync(fontPath) ? fontPath : null;
}
