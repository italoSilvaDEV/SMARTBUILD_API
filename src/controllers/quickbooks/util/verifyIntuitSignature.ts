// src/controllers/quickbooks/util/verifyIntuitSignature.ts
import crypto from "crypto";

export function verifyIntuitSignature(
  rawBody: Buffer | string | any,
  signatureHeader: string | undefined,
  verifierToken: string
): boolean {
  if (!signatureHeader) return false;

  let toSign: Buffer;
  if (Buffer.isBuffer(rawBody)) toSign = rawBody;
  else if (typeof rawBody === "string") toSign = Buffer.from(rawBody, "utf8");
  else toSign = Buffer.from(JSON.stringify(rawBody), "utf8");

  const hmac = crypto.createHmac("sha256", verifierToken);
  hmac.update(toSign);
  const digest = hmac.digest("base64");

  return signatureHeader.split(",").some((sig) => sig.trim() === digest);
}
