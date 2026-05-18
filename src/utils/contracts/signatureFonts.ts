import fs from "fs";
import path from "path";

export const DEFAULT_CONTRACT_SIGNATURE_FONT_KEY = "classic";

export const CONTRACT_SIGNATURE_FONTS = [
  {
    key: "classic",
    label: "Classic",
    fileName: null,
    sourceUrl: null,
  },
  {
    key: "great_vibes",
    label: "Great Vibes",
    fileName: "great-vibes.ttf",
    sourceUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/greatvibes/GreatVibes-Regular.ttf",
  },
  {
    key: "allura",
    label: "Allura",
    fileName: "allura.ttf",
    sourceUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/allura/Allura-Regular.ttf",
  },
  {
    key: "parisienne",
    label: "Parisienne",
    fileName: "parisienne.ttf",
    sourceUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/parisienne/Parisienne-Regular.ttf",
  },
  {
    key: "pacifico",
    label: "Pacifico",
    fileName: "pacifico.ttf",
    sourceUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/pacifico/Pacifico-Regular.ttf",
  },
  {
    key: "sacramento",
    label: "Sacramento",
    fileName: "sacramento.ttf",
    sourceUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/sacramento/Sacramento-Regular.ttf",
  },
  {
    key: "marck_script",
    label: "Marck Script",
    fileName: "marck-script.ttf",
    sourceUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/marckscript/MarckScript-Regular.ttf",
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

export function getContractSignatureFontCandidatePaths(value?: string | null) {
  const definition = getContractSignatureFontDefinition(value);
  if (!definition.fileName) return [];

  return [
    path.resolve(process.cwd(), "public", "fonts", "signatures", definition.fileName),
    path.resolve(process.cwd(), "dist", "public", "fonts", "signatures", definition.fileName),
    path.resolve(process.cwd(), "tmp", "contract-signature-fonts", definition.fileName),
    path.resolve(__dirname, "../../public/fonts/signatures", definition.fileName),
    path.resolve(__dirname, "../../../../public/fonts/signatures", definition.fileName),
    path.resolve(__dirname, "../../../public/fonts/signatures", definition.fileName),
  ];
}

export function getContractSignatureFontPath(value?: string | null) {
  return getContractSignatureFontCandidatePaths(value).find((fontPath) => fs.existsSync(fontPath)) || null;
}

export async function resolveContractSignatureFontPath(value?: string | null) {
  const existingPath = getContractSignatureFontPath(value);
  if (existingPath) return existingPath;

  const definition = getContractSignatureFontDefinition(value);
  if (!definition.fileName || !definition.sourceUrl) return null;

  const cachePath = path.resolve(process.cwd(), "tmp", "contract-signature-fonts", definition.fileName);
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    const response = await fetch(definition.sourceUrl);
    if (!response.ok) {
      console.warn(`[contracts.font] Could not download signature font key="${definition.key}" status=${response.status} url="${definition.sourceUrl}"`);
      return null;
    }

    fs.writeFileSync(cachePath, Buffer.from(await response.arrayBuffer()));
    console.info(`[contracts.font] downloaded signature font key="${definition.key}" path="${cachePath}"`);
    return cachePath;
  } catch (error) {
    console.warn(`[contracts.font] Could not download signature font key="${definition.key}" url="${definition.sourceUrl}"`, error);
    return null;
  }
}
