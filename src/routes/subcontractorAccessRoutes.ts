import { Router, Request, Response, NextFunction } from "express";
import { checkToken } from "../middlewares/checkToken";
import { checkSubcontractorToken, ExternalRequest } from "../middlewares/checkSubcontractorToken";
import { SubcontractorAccessService, externalServiceError } from "../services/SubcontractorAccessService";
import { externalAccessEnabled, issueExternalSession } from "../utils/subcontractorIdentity";
import { prisma } from "../utils/prisma";

export const subcontractorAccessRoutes = Router();
const service = new SubcontractorAccessService();
const base = "/subcontractors/:subcontractorId/app-access";

function enabled(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store");
  if (!externalAccessEnabled()) return res.status(503).json({ error: "SUBCONTRACTOR_ACCESS_DISABLED" });
  return next();
}

// Isolated bounded in-memory limiter. Configure trusted proxy addresses at the
// deployment boundary; never trust a caller-supplied X-Forwarded-For directly.
const attempts = new Map<string, { count: number; expires: number }>();
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.expires <= now) attempts.delete(key);
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const entry = attempts.get(key) || { count: 0, expires: now + 15 * 60000 };
  if (entry.count >= 30 || (!attempts.has(key) && attempts.size >= 10000)) {
    res.setHeader("Retry-After", "900");
    return res.status(429).json({ error: "TOO_MANY_ATTEMPTS" });
  }
  entry.count++;
  attempts.set(key, entry);
  return next();
}

const handle = (action: (req: ExternalRequest, res: Response) => Promise<unknown>) =>
  async (req: ExternalRequest, res: Response) => {
    try { await action(req, res); }
    catch (error) {
      const failure = externalServiceError(error);
      // Do not log invitation capabilities, credentials, payloads or Prisma parameters.
      if (failure.status === 500) console.error("[subcontractor-access] Request failed");
      res.status(failure.status).json({ error: failure.code });
    }
  };

subcontractorAccessRoutes.get(base, enabled, checkToken, handle(async (req, res) => {
  res.json(await service.list((req as any).userId, req.params.subcontractorId));
}));
subcontractorAccessRoutes.post(`${base}/invites`, enabled, checkToken, rateLimit, handle(async (req, res) => {
  res.status(201).json(await service.invite((req as any).userId, req.params.subcontractorId, req.body || {}));
}));
subcontractorAccessRoutes.post(`${base}/invites/:inviteId/revoke`, enabled, checkToken, handle(async (req, res) => {
  await service.revokeInvite((req as any).userId, req.params.subcontractorId, req.params.inviteId);
  res.sendStatus(204);
}));
subcontractorAccessRoutes.post(`${base}/accesses/:accessId/revoke`, enabled, checkToken, handle(async (req, res) => {
  await service.revokeAccess((req as any).userId, req.params.subcontractorId, req.params.accessId);
  res.sendStatus(204);
}));

// Public capability exchange uses POST so tokens never enter access-log URLs.
subcontractorAccessRoutes.post("/subcontractor-auth/invites/preview", enabled, rateLimit, handle(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await service.previewInvite(req.body?.token));
}));
subcontractorAccessRoutes.post("/subcontractor-auth/invites/accept", enabled, rateLimit, handle(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await service.accept(req.body?.token, req.body?.password));
}));
subcontractorAccessRoutes.post("/subcontractor-auth/login", enabled, rateLimit, handle(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await service.login(req.body?.email, req.body?.password));
}));
subcontractorAccessRoutes.get("/subcontractor-auth/me", enabled, checkSubcontractorToken, handle(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const account = await prisma.subcontractorAccount.findUnique({ where: { id: req.externalSession!.sub }, select: {
    id: true, name: true, email: true, participant: { select: { id: true } },
  } });
  res.json({ account, contexts: await service.contexts(req.externalSession!.sub) });
}));
subcontractorAccessRoutes.post("/subcontractor-auth/context", enabled, checkSubcontractorToken, handle(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (typeof req.body?.accessId !== "string") { res.status(400).json({ error: "INVALID_ACCESS" }); return; }
  const contexts = await service.contexts(req.externalSession!.sub);
  const context = contexts.find((item) => item.id === req.body.accessId);
  if (!context) { res.status(403).json({ error: "ACCESS_DENIED" }); return; }
  const token = issueExternalSession({ id: req.externalSession!.sub, sessionVersion: req.externalSession!.sessionVersion }, context);
  res.json({ token, context });
}));
