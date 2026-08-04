import { describe, expect, it } from "@jest/globals";
import sharp from "sharp";

import { validateEstimateClientSignature } from "./estimateSignatureValidation";

const asDataUrl = (buffer: Buffer, type: "png" | "jpeg" = "png") =>
  `data:image/${type};base64,${buffer.toString("base64")}`;

const renderSvg = async (content: string, type: "png" | "jpeg" = "png") => {
  const image = sharp(Buffer.from(content));
  return type === "jpeg" ? image.jpeg({ quality: 90 }).toBuffer() : image.png().toBuffer();
};

const validSignatureSvg = (background = "none", stroke = "black") => `
  <svg xmlns="http://www.w3.org/2000/svg" width="600" height="200">
    ${background === "white" ? '<rect width="600" height="200" fill="white" />' : ""}
    <path d="M45 125 C80 50 100 165 145 92 S205 150 248 78 S310 145 360 82 S430 138 540 70"
      fill="none" stroke="${stroke}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M70 145 C160 128 260 154 500 120"
      fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" />
  </svg>`;

const denseSignatureSvg = () => {
  const strokes = Array.from({ length: 24 }, (_, index) => {
    const startY = 18 + index * 10;
    const controlY = index % 2 === 0 ? 275 - index * 3 : 35 + index * 4;
    const endY = 25 + ((index * 37) % 235);
    return `<path d="M20 ${startY} Q450 ${controlY} 880 ${endY}" fill="none" stroke="black" stroke-width="4" stroke-linecap="round" />`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300">${strokes}</svg>`;
};

const corruptedPatternPng = async (colors: number[][]) => {
  const width = 1174;
  const height = 391;
  const pixels = Buffer.alloc(width * height * 4);

  for (let pixel = 0; pixel < width * height; pixel += 1) {
    const color = colors[pixel % colors.length];
    pixels.set(color, pixel * 4);
  }

  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

describe("estimate signature validation", () => {
  it("accepts a normal transparent black signature", async () => {
    const png = await renderSvg(validSignatureSvg());
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(true);
    expect(result.metrics?.coloredVisibleRatio).toBe(0);
  });

  it("accepts a dense legitimate signature", async () => {
    const png = await renderSvg(denseSignatureSvg());
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(true);
    expect(result.metrics?.inkPixels).toBeGreaterThan(10_000);
  });

  it("accepts a legacy white-background PNG signature", async () => {
    const png = await renderSvg(validSignatureSvg("white"));
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(true);
    expect(result.metrics?.fullyOpaqueRatio).toBe(1);
  });

  it("accepts a black-on-white JPEG signature", async () => {
    const jpeg = await renderSvg(validSignatureSvg("white"), "jpeg");
    const result = await validateEstimateClientSignature(asDataUrl(jpeg, "jpeg"));

    expect(result.valid).toBe(true);
  });

  it("does not reject a legitimate colored signature from one unusual metric alone", async () => {
    const png = await renderSvg(validSignatureSvg("none", "#1457cc"));
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(true);
    expect(result.metrics?.coloredVisibleRatio).toBeGreaterThan(0.2);
  });

  it.each([
    {
      estimate: "1202-01",
      colors: [
        [18, 170, 11, 137], [35, 35, 115, 187], [193, 168, 88, 30], [239, 89, 155, 54],
        [54, 172, 166, 206], [122, 3, 119, 249], [101, 32, 26, 20], [255, 75, 0, 76],
      ],
    },
    {
      estimate: "1199-01",
      colors: [
        [61, 133, 35, 28], [47, 253, 153, 55], [47, 81, 154, 212], [56, 65, 59, 199],
        [15, 241, 113, 80], [192, 165, 250, 63], [192, 18, 84, 58], [195, 200, 39, 26],
      ],
    },
  ])("rejects the $estimate forensic corruption pattern", async ({ colors }) => {
    const png = await corruptedPatternPng(colors);
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("suspicious-image");
    expect(result.metrics?.uniqueColors).toBe(8);
    expect(result.metrics?.repeatingPixelPeriod).toBe(8);
    expect(result.suspiciousSignals).toEqual(expect.arrayContaining([
      "missing-alpha-extremes",
      "unexpected-colored-content",
      "repeating-pixel-pattern",
      "full-canvas-high-density",
      "full-canvas-low-color-diversity",
    ]));
  });

  it("rejects an empty image as too weak", async () => {
    const png = await sharp({
      create: { width: 600, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    }).png().toBuffer();
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("signature-too-weak");
  });

  it("rejects dimensions outside the capture envelope", async () => {
    const png = await renderSvg('<svg xmlns="http://www.w3.org/2000/svg" width="3001" height="100"><path d="M0 50 L3000 50" stroke="black" stroke-width="4" /></svg>');
    const result = await validateEstimateClientSignature(asDataUrl(png));

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("image-dimensions-too-large");
  });
});
