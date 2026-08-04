import sharp from "sharp";

export const SIGNATURE_TOO_WEAK_MESSAGE = "Please provide a clearer signature before confirming.";
export const SIGNATURE_CORRUPTED_MESSAGE =
  "We could not verify this signature image. Please clear it and sign again. If the problem continues, refresh the page or use another browser.";

const SIGNATURE_MAX_BYTES = Number(process.env.ESTIMATE_SIGNATURE_MAX_BYTES || 6_000_000);
const SIGNATURE_MAX_WIDTH = Number(process.env.ESTIMATE_SIGNATURE_MAX_WIDTH || 3_000);
const SIGNATURE_MAX_HEIGHT = Number(process.env.ESTIMATE_SIGNATURE_MAX_HEIGHT || 1_500);
const SIGNATURE_MAX_PIXELS = Number(process.env.ESTIMATE_SIGNATURE_MAX_PIXELS || 3_000_000);
const SIGNATURE_MIN_INK_PIXELS = Number(process.env.ESTIMATE_SIGNATURE_MIN_INK_PIXELS || 80);
const SIGNATURE_MIN_WIDTH = Number(process.env.ESTIMATE_SIGNATURE_MIN_WIDTH || 20);
const SIGNATURE_MIN_HEIGHT = Number(process.env.ESTIMATE_SIGNATURE_MIN_HEIGHT || 6);

const ALPHA_BACKGROUND_THRESHOLD = 20;
const BACKGROUND_DIFF_THRESHOLD = 40;
const COLOR_CHROMA_THRESHOLD = 24;
const MIN_ALPHA_EXTREME_RATIO = 0.01;
const MAX_COLORED_VISIBLE_RATIO = 0.2;
const MAX_REPEATING_PIXEL_PERIOD = 32;
const MAX_TRACKED_UNIQUE_COLORS = 256;
const MAX_DENSE_INK_RATIO = 0.8;
const MIN_FULL_CANVAS_COVERAGE = 0.95;

export type SignatureValidationMetrics = {
  width: number;
  height: number;
  totalPixels: number;
  encodedBytes: number;
  rawBytes: number;
  encodedToRawRatio: number;
  transparentRatio: number;
  fullyTransparentRatio: number;
  fullyOpaqueRatio: number;
  alphaExtremeRatio: number;
  coloredVisibleRatio: number;
  uniqueColors: number;
  uniqueColorsCapped: boolean;
  repeatingPixelPeriod: number | null;
  inkPixels: number;
  inkWidth: number;
  inkHeight: number;
  inkDensity: number;
  boundingBoxCoverage: number;
};

export type SignatureValidationResult = {
  valid: boolean;
  error?: string;
  reason?:
    | "invalid-image"
    | "image-too-large"
    | "image-dimensions-too-large"
    | "signature-too-weak"
    | "suspicious-image";
  suspiciousSignals?: string[];
  metrics?: SignatureValidationMetrics;
};

const getSignatureBuffer = (signature: unknown): Buffer | null => {
  if (typeof signature !== "string") return null;
  if (!/^data:image\/(png|jpe?g);base64,/i.test(signature)) return null;

  const base64Data = signature.replace(/^data:image\/[a-z]+;base64,/i, "");
  if (!base64Data.trim()) return null;

  return Buffer.from(base64Data, "base64");
};

const colorDistance = (
  r: number,
  g: number,
  b: number,
  background: { r: number; g: number; b: number }
) => Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b);

const getBackgroundColorFromCorners = (
  data: Buffer,
  width: number,
  height: number
): { r: number; g: number; b: number } => {
  const sampleSize = Math.min(12, width, height);
  let background = { r: 255, g: 255, b: 255 };
  let maxBrightness = -1;

  const samplePixel = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    const alpha = data[index + 3];
    if (alpha <= ALPHA_BACKGROUND_THRESHOLD) return;

    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const brightness = r + g + b;

    if (brightness > maxBrightness) {
      background = { r, g, b };
      maxBrightness = brightness;
    }
  };

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      samplePixel(x, y);
      samplePixel(width - 1 - x, y);
      samplePixel(x, height - 1 - y);
      samplePixel(width - 1 - x, height - 1 - y);
    }
  }

  return background;
};

const findRepeatingPixelPeriod = (data: Buffer, totalPixels: number): number | null => {
  if (totalPixels < 1_000) return null;

  for (let period = 1; period <= Math.min(MAX_REPEATING_PIXEL_PERIOD, totalPixels / 2); period += 1) {
    let repeats = true;

    for (let pixel = period; pixel < totalPixels; pixel += 1) {
      const current = pixel * 4;
      const previous = (pixel - period) * 4;
      if (
        data[current] !== data[previous] ||
        data[current + 1] !== data[previous + 1] ||
        data[current + 2] !== data[previous + 2] ||
        data[current + 3] !== data[previous + 3]
      ) {
        repeats = false;
        break;
      }
    }

    if (repeats) return period;
  }

  return null;
};

const analyzeSignaturePixels = (
  data: Buffer,
  width: number,
  height: number,
  encodedBytes: number
): SignatureValidationMetrics => {
  const totalPixels = width * height;
  const background = getBackgroundColorFromCorners(data, width, height);
  let transparentPixels = 0;
  let fullyTransparentPixels = 0;
  let fullyOpaquePixels = 0;
  let visiblePixels = 0;
  let coloredVisiblePixels = 0;
  const uniqueColors = new Set<number>();
  let uniqueColorsCapped = false;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const alpha = data[index + 3];

    if (alpha <= ALPHA_BACKGROUND_THRESHOLD) transparentPixels += 1;
    if (alpha === 0) fullyTransparentPixels += 1;
    if (alpha === 255) fullyOpaquePixels += 1;

    if (alpha > ALPHA_BACKGROUND_THRESHOLD) {
      visiblePixels += 1;
      if (Math.max(r, g, b) - Math.min(r, g, b) >= COLOR_CHROMA_THRESHOLD) {
        coloredVisiblePixels += 1;
      }
    }

    if (!uniqueColorsCapped) {
      const colorKey = (((r << 24) | (g << 16) | (b << 8) | alpha) >>> 0);
      uniqueColors.add(colorKey);
      if (uniqueColors.size > MAX_TRACKED_UNIQUE_COLORS) {
        uniqueColorsCapped = true;
      }
    }
  }

  const transparentRatio = transparentPixels / totalPixels;
  const hasTransparentBackground = transparentRatio > 0.01;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let inkPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha <= ALPHA_BACKGROUND_THRESHOLD) continue;

      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const isInk = hasTransparentBackground
        ? true
        : colorDistance(r, g, b, background) > BACKGROUND_DIFF_THRESHOLD &&
          (r < 245 || g < 245 || b < 245);

      if (!isInk) continue;

      inkPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const inkWidth = inkPixels > 0 ? maxX - minX + 1 : 0;
  const inkHeight = inkPixels > 0 ? maxY - minY + 1 : 0;
  const boundingBoxArea = inkWidth * inkHeight;

  return {
    width,
    height,
    totalPixels,
    encodedBytes,
    rawBytes: data.length,
    encodedToRawRatio: data.length > 0 ? encodedBytes / data.length : 0,
    transparentRatio,
    fullyTransparentRatio: fullyTransparentPixels / totalPixels,
    fullyOpaqueRatio: fullyOpaquePixels / totalPixels,
    alphaExtremeRatio: (fullyTransparentPixels + fullyOpaquePixels) / totalPixels,
    coloredVisibleRatio: visiblePixels > 0 ? coloredVisiblePixels / visiblePixels : 0,
    uniqueColors: uniqueColors.size,
    uniqueColorsCapped,
    repeatingPixelPeriod: findRepeatingPixelPeriod(data, totalPixels),
    inkPixels,
    inkWidth,
    inkHeight,
    inkDensity: boundingBoxArea > 0 ? inkPixels / boundingBoxArea : 0,
    boundingBoxCoverage: totalPixels > 0 ? boundingBoxArea / totalPixels : 0,
  };
};

export const validateEstimateClientSignature = async (
  signature: unknown
): Promise<SignatureValidationResult> => {
  const signatureBuffer = getSignatureBuffer(signature);
  if (!signatureBuffer) {
    return { valid: false, error: "A valid signature image is required.", reason: "invalid-image" };
  }

  if (signatureBuffer.length > SIGNATURE_MAX_BYTES) {
    return { valid: false, error: "Signature image is too large.", reason: "image-too-large" };
  }

  try {
    const metadata = await sharp(signatureBuffer, { limitInputPixels: SIGNATURE_MAX_PIXELS }).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    const totalPixels = width * height;

    if (
      width <= 0 ||
      height <= 0 ||
      width > SIGNATURE_MAX_WIDTH ||
      height > SIGNATURE_MAX_HEIGHT ||
      totalPixels > SIGNATURE_MAX_PIXELS
    ) {
      return {
        valid: false,
        error: "Signature image dimensions are too large.",
        reason: "image-dimensions-too-large",
      };
    }

    const { data, info } = await sharp(signatureBuffer, { limitInputPixels: SIGNATURE_MAX_PIXELS })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const metrics = analyzeSignaturePixels(data, info.width, info.height, signatureBuffer.length);

    const hasMinimumInk =
      metrics.inkPixels >= SIGNATURE_MIN_INK_PIXELS &&
      metrics.inkWidth >= SIGNATURE_MIN_WIDTH &&
      metrics.inkHeight >= SIGNATURE_MIN_HEIGHT;

    if (!hasMinimumInk) {
      return {
        valid: false,
        error: SIGNATURE_TOO_WEAK_MESSAGE,
        reason: "signature-too-weak",
        metrics,
      };
    }

    const suspiciousSignals: string[] = [];
    if (metrics.alphaExtremeRatio < MIN_ALPHA_EXTREME_RATIO) {
      suspiciousSignals.push("missing-alpha-extremes");
    }
    if (metrics.coloredVisibleRatio > MAX_COLORED_VISIBLE_RATIO) {
      suspiciousSignals.push("unexpected-colored-content");
    }
    if (metrics.repeatingPixelPeriod !== null) {
      suspiciousSignals.push("repeating-pixel-pattern");
    }
    if (
      metrics.inkDensity > MAX_DENSE_INK_RATIO &&
      metrics.boundingBoxCoverage > MIN_FULL_CANVAS_COVERAGE
    ) {
      suspiciousSignals.push("full-canvas-high-density");
    }
    if (
      !metrics.uniqueColorsCapped &&
      metrics.uniqueColors <= 16 &&
      metrics.boundingBoxCoverage > MIN_FULL_CANVAS_COVERAGE
    ) {
      suspiciousSignals.push("full-canvas-low-color-diversity");
    }

    const hasRepeatingPattern = suspiciousSignals.includes("repeating-pixel-pattern");
    const hasFullCanvasArtifact =
      suspiciousSignals.includes("full-canvas-high-density") &&
      suspiciousSignals.includes("full-canvas-low-color-diversity");
    const hasAbnormalColorAndAlpha =
      suspiciousSignals.includes("missing-alpha-extremes") &&
      suspiciousSignals.includes("unexpected-colored-content") &&
      metrics.boundingBoxCoverage > MIN_FULL_CANVAS_COVERAGE;

    // A single unusual metric can occur in a legitimate dense or colored signature.
    // Reject only a definitive repeating pattern or a corroborated group of artifacts.
    if (hasRepeatingPattern || hasFullCanvasArtifact || hasAbnormalColorAndAlpha) {
      return {
        valid: false,
        error: SIGNATURE_CORRUPTED_MESSAGE,
        reason: "suspicious-image",
        suspiciousSignals,
        metrics,
      };
    }

    return { valid: true, metrics };
  } catch {
    return { valid: false, error: "A valid signature image is required.", reason: "invalid-image" };
  }
};
