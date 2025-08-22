// src/modules/quickbooks/util/qboState.ts
import crypto from "crypto";
import { prisma } from "../../../utils/prisma";

const TEN_MIN = 10 * 60 * 1000;

export async function issueState(userId: string, companyId: string, redirectTo?: string) {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TEN_MIN);

  await prisma.quickBooksOAuthState.create({
    data: { nonce, userId, companyId, redirectTo, expiresAt },
  });

  return nonce;
}

export async function verifyAndConsumeState(nonce: string) {
  const rec = await prisma.quickBooksOAuthState.findUnique({ where: { nonce } });
  if (!rec) return { ok: false as const, reason: "not_found" };
  if (rec.used) return { ok: false as const, reason: "used" };
  if (rec.expiresAt < new Date()) return { ok: false as const, reason: "expired" };

  await prisma.quickBooksOAuthState.update({
    where: { nonce },
    data: { used: true },
  });

  return {
    ok: true as const,
    userId: rec.userId,
    companyId: rec.companyId,
    redirectTo: rec.redirectTo,
  };
}
