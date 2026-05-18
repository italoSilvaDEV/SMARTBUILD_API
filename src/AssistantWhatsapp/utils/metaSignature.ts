import crypto from "crypto";

export function getRawBodyBuffer(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body && typeof body === "object") return Buffer.from(JSON.stringify(body), "utf8");
  return Buffer.from("");
}

export function verifyMetaSignature(params: {
  appSecret: string;
  signatureHeader: string | string[] | undefined;
  rawBody: Buffer;
}) {
  const signatureHeader = Array.isArray(params.signatureHeader)
    ? params.signatureHeader[0]
    : params.signatureHeader;

  if (!params.appSecret || !signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", params.appSecret)
    .update(params.rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

