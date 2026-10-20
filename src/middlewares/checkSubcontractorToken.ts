import { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { ExternalSession, verifyExternalSession } from "../utils/subcontractorIdentity";

export type ExternalRequest = Request & { externalSession?: ExternalSession };

// Never sets req.userId: external sessions must not impersonate employee sessions.
export async function checkSubcontractorToken(req: ExternalRequest, res: Response, next: NextFunction) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
  if (!match) return res.status(401).json({ error: "INVALID_EXTERNAL_SESSION" });
  let session: ExternalSession;
  try { session = verifyExternalSession(match[1]); }
  catch { return res.status(401).json({ error: "INVALID_EXTERNAL_SESSION" }); }
  try {
    const account = await prisma.subcontractorAccount.findUnique({ where: { id: session.sub }, select: { isDisabled: true, sessionVersion: true } });
    if (!account || account.isDisabled || account.sessionVersion !== session.sessionVersion) {
      return res.status(401).json({ error: "INVALID_EXTERNAL_SESSION" });
    }
    if (session.accessId) {
      const access = await prisma.subcontractorAccess.findFirst({ where: {
        id: session.accessId, accountId: session.sub, status: "active", version: session.accessVersion,
        subcontractor: { company: { isActive: true } },
      }, select: { id: true } });
      if (!Number.isInteger(session.accessVersion) || !access) return res.status(403).json({ error: "ACCESS_DENIED" });
    }
    req.externalSession = session;
    return next();
  } catch {
    return res.status(503).json({ error: "ACCESS_VALIDATION_UNAVAILABLE" });
  }
}
