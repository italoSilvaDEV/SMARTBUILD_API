import crypto from "crypto";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type StagedUploadPurpose = "estimate-pdf" | "estimate-attachment";

export type StagedUploadReference = {
  key: string;
  token: string;
  originalName: string;
  contentType: string;
  size: number;
  purpose: StagedUploadPurpose;
  expiresAt: string;
};

type TokenPayload = {
  key: string;
  companyId: string;
  userId: string;
  purpose: StagedUploadPurpose;
  contentType: string;
  size: number;
  expiresAt: string;
};

const UPLOAD_EXPIRATION_SECONDS = 60 * 60;
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

const ALLOWED_CONTENT_TYPES: Record<StagedUploadPurpose, Set<string>> = {
  "estimate-pdf": new Set(["application/pdf"]),
  "estimate-attachment": new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ]),
};

const getS3Client = () => new S3Client({
  region: process.env.AMAZON_S3_REGION,
  credentials: {
    accessKeyId: process.env.AMAZON_S3_KEY!,
    secretAccessKey: process.env.AMAZON_S3_SECRET!,
  },
});

const getSigningSecret = () => {
  const secret = process.env.SECRET_JWT || process.env.JWT_SECRET || process.env.AMAZON_S3_SECRET;
  if (!secret) {
    throw new Error("Staged upload signing secret is not configured");
  }
  return secret;
};

const base64UrlEncode = (value: string) => Buffer.from(value).toString("base64url");
const base64UrlDecode = (value: string) => Buffer.from(value, "base64url").toString("utf8");

const signPayload = (payload: TokenPayload) => {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
};

const verifyToken = (token: string): TokenPayload => {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    throw new Error("Invalid staged upload token");
  }

  const expectedSignature = crypto
    .createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");

  const signatureBuffer = Buffer.from(signature);
  const expectedSignatureBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedSignatureBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)
  ) {
    throw new Error("Invalid staged upload token");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as TokenPayload;
  if (new Date(payload.expiresAt).getTime() < Date.now()) {
    throw new Error("Staged upload token expired");
  }

  return payload;
};

const sanitizeFileName = (fileName: string) => {
  const parsed = path.parse(fileName || "upload");
  const baseName = parsed.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 80) || "upload";
  const extension = parsed.ext.replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12);
  return `${baseName}${extension}`;
};

export const createStagedUpload = async (params: {
  companyId: string;
  userId: string;
  fileName: string;
  contentType: string;
  size: number;
  purpose: StagedUploadPurpose;
}) => {
  if (!params.companyId) throw new Error("companyId is required");
  if (!params.userId) throw new Error("userId is required");
  if (!params.fileName) throw new Error("fileName is required");
  if (!params.contentType) throw new Error("contentType is required");
  if (!Number.isFinite(params.size) || params.size <= 0) throw new Error("size is required");
  if (params.size > MAX_FILE_SIZE_BYTES) throw new Error("File is too large");
  if (!ALLOWED_CONTENT_TYPES[params.purpose]?.has(params.contentType)) {
    throw new Error("File type is not allowed for this upload");
  }

  const expiresAt = new Date(Date.now() + UPLOAD_EXPIRATION_SECONDS * 1000).toISOString();
  const safeName = sanitizeFileName(params.fileName);
  const key = `staged/${params.companyId}/${params.userId}/${crypto.randomUUID()}-${safeName}`;
  const token = signPayload({
    key,
    companyId: params.companyId,
    userId: params.userId,
    purpose: params.purpose,
    contentType: params.contentType,
    size: params.size,
    expiresAt,
  });

  const command = new PutObjectCommand({
    Bucket: process.env.AMAZON_S3_BUCKET!,
    Key: key,
    ContentType: params.contentType,
  });

  const uploadUrl = await getSignedUrl(getS3Client(), command, { expiresIn: UPLOAD_EXPIRATION_SECONDS });

  return {
    key,
    token,
    uploadUrl,
    method: "PUT" as const,
    headers: { "Content-Type": params.contentType },
    expiresAt,
  };
};

export const verifyStagedUploadReference = async (
  reference: StagedUploadReference,
  params: { companyId: string; userId: string; purpose: StagedUploadPurpose }
) => {
  if (!reference?.key || !reference.token) {
    throw new Error("Staged upload reference is required");
  }

  const payload = verifyToken(reference.token);
  if (
    payload.key !== reference.key ||
    payload.companyId !== params.companyId ||
    payload.userId !== params.userId ||
    payload.purpose !== params.purpose ||
    payload.contentType !== reference.contentType ||
    payload.size !== reference.size
  ) {
    throw new Error("Staged upload reference does not match request");
  }

  const head = await getS3Client().send(new HeadObjectCommand({
    Bucket: process.env.AMAZON_S3_BUCKET!,
    Key: reference.key,
  }));

  if (head.ContentLength !== undefined && head.ContentLength !== reference.size) {
    throw new Error("Staged upload size does not match");
  }

  if (head.ContentType && head.ContentType !== reference.contentType) {
    throw new Error("Staged upload content type does not match");
  }

  return reference;
};

export const getStagedObjectBuffer = async (key: string) => {
  const response = await getS3Client().send(new GetObjectCommand({
    Bucket: process.env.AMAZON_S3_BUCKET!,
    Key: key,
  }));

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Buffer | Uint8Array | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const putS3ObjectBuffer = async (params: { key: string; body: Buffer; contentType: string }) => {
  await getS3Client().send(new PutObjectCommand({
    Bucket: process.env.AMAZON_S3_BUCKET!,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
  }));
};

export const deleteS3ObjectQuietly = async (key?: string | null) => {
  if (!key) return;
  try {
    await getS3Client().send(new DeleteObjectCommand({
      Bucket: process.env.AMAZON_S3_BUCKET!,
      Key: key,
    }));
  } catch (error) {
    console.error("[stagedUpload] Failed to delete S3 object:", error);
  }
};
