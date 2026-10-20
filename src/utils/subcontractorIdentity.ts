import { createHash, randomBytes } from "crypto";
import Jwt from "jsonwebtoken";

export class SubcontractorAccessError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export function normalizeExternalEmail(value: unknown): string {
  if (typeof value !== "string") throw new SubcontractorAccessError(400, "INVALID_EMAIL");
  const email = value.trim().toLowerCase();
  if (email.length > 191 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new SubcontractorAccessError(400, "INVALID_EMAIL");
  }
  return email;
}

export function validateExternalPassword(value: unknown, isNewAccount = true): string {
  if (typeof value !== "string" || !value || Buffer.byteLength(value, "utf8") > 72 || (isNewAccount && value.length < 12)) {
    throw new SubcontractorAccessError(400, "INVALID_PASSWORD");
  }
  return value;
}

export function hashInviteToken(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new SubcontractorAccessError(410, "INVITE_UNAVAILABLE");
  }
  return createHash("sha256").update(value).digest("hex");
}

export function createInviteToken() {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashInviteToken(token) };
}

export function externalAccessEnabled() {
  return process.env.SUBCONTRACTOR_ACCESS_ENABLED === "true";
}

export function inviteWebUrl(token: string) {
  const configured = process.env.SUBCONTRACTOR_WEB_URL;
  if (!configured) throw new SubcontractorAccessError(503, "INVITE_DELIVERY_NOT_CONFIGURED");
  const url = new URL(configured);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new SubcontractorAccessError(503, "INVITE_DELIVERY_NOT_CONFIGURED");
  }
  // Fragment keeps the capability out of HTTP request URLs and referrer headers.
  return `${url.origin}/subcontractor-invite#token=${token}`;
}

function secret() {
  const value = process.env.SECRET_JWT;
  if (!value) throw new SubcontractorAccessError(503, "AUTH_NOT_CONFIGURED");
  return value;
}

export type ExternalSession = {
  type: "subcontractor_session";
  sub: string;
  sessionVersion: number;
  accessId?: string;
  accessVersion?: number;
};

export function issueExternalSession(account: { id: string; sessionVersion: number }, access?: { id: string; version: number }) {
  return Jwt.sign({
    type: "subcontractor_session", sessionVersion: account.sessionVersion,
    ...(access ? { accessId: access.id, accessVersion: access.version } : {}),
  }, secret(), { algorithm: "HS256", subject: account.id, audience: "smartbuild-subcontractor", issuer: "smartbuild", expiresIn: "7d" });
}

export function verifyExternalSession(token: string): ExternalSession {
  const payload = Jwt.verify(token, secret(), {
    algorithms: ["HS256"], audience: "smartbuild-subcontractor", issuer: "smartbuild",
  });
  if (typeof payload === "string" || payload.type !== "subcontractor_session" || !payload.sub || !Number.isInteger(payload.sessionVersion)) {
    throw new SubcontractorAccessError(401, "INVALID_EXTERNAL_SESSION");
  }
  return payload as ExternalSession;
}
