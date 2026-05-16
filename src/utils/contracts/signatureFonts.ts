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
    key: "marck_script",
    label: "Marck Script",
    fileName: "marck-script.ttf",
  },
] as const;

export type ContractSignatureFontKey = typeof CONTRACT_SIGNATURE_FONTS[number]["key"];

const FONT_BY_KEY = new Map(CONTRACT_SIGNATURE_FONTS.map((font) => [font.key, font]));
const LEGACY_FONT_ALIASES = new Map<string, ContractSignatureFontKey>([
  ["alex_brush", "marck_script"],
]);

function resolveContractSignatureFontKey(value?: string | null) {
  const rawKey = typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_CONTRACT_SIGNATURE_FONT_KEY;

  return LEGACY_FONT_ALIASES.get(rawKey) || rawKey;
}

export function normalizeContractSignatureFontKey(value: unknown, fieldName = "Signature font") {
  const key = resolveContractSignatureFontKey(typeof value === "string" ? value : null);

  if (!FONT_BY_KEY.has(key as ContractSignatureFontKey)) {
    throw new Error(`${fieldName} is invalid`);
  }

  return key as ContractSignatureFontKey;
}

export function getContractSignatureFontDefinition(value?: string | null) {
  const resolvedKey = resolveContractSignatureFontKey(value);
  const key = FONT_BY_KEY.has(resolvedKey as ContractSignatureFontKey)
    ? (resolvedKey as ContractSignatureFontKey)
    : DEFAULT_CONTRACT_SIGNATURE_FONT_KEY;

  return FONT_BY_KEY.get(key)!;
}

export function getContractSignatureFontPath(value?: string | null) {
  const definition = getContractSignatureFontDefinition(value);
  if (!definition.fileName) return null;

  const candidatePaths = [
    path.resolve(process.cwd(), "public", "fonts", "signatures", definition.fileName),
    path.resolve(process.cwd(), "dist", "public", "fonts", "signatures", definition.fileName),
    path.resolve(__dirname, "../../public/fonts/signatures", definition.fileName),
    path.resolve(__dirname, "../../../../public/fonts/signatures", definition.fileName),
    path.resolve(__dirname, "../../../public/fonts/signatures", definition.fileName),
  ];

  return candidatePaths.find((fontPath) => fs.existsSync(fontPath)) || null;
}
