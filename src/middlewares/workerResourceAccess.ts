import { RequestHandler } from 'express';
import { prisma } from '../utils/prisma';
import { canAccessCompanySubscription, canUseCompanyFeature } from '../services/CompanyFeatureAccess';
export const requireWorkerTimeAccess: RequestHandler = async (req, res, next) => {
  const actorId = (req as any).userId;
  if (!actorId) return res.status(401).json({ error: 'Authentication required' });
  const { companyId, workerId } = req.params;
  if (!companyId || !workerId) return res.status(400).json({ error: 'Company and worker required' });
  try {
    const worker = await prisma.user.findFirst({ where: { id: workerId, OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] }, select: { id: true } });
    if (!worker) return res.status(403).json({ error: 'Worker access denied' });
    const allowed = actorId === workerId
      ? await canAccessCompanySubscription(actorId, companyId)
      : await canUseCompanyFeature(actorId, companyId, 'Time Cards');
    if (!allowed) return res.status(403).json({ error: 'Worker access denied' });
    return next();
  } catch { return res.status(503).json({ error: 'Unable to verify worker access' }); }
};
export function requireWorkerSchedule(ownOnly = false): RequestHandler {
  return async (req, res, next) => {
    const actorId = (req as any).userId;
    if (!actorId) return res.status(401).json({ error: 'Authentication required' });
    const workerId = ownOnly ? req.body?.user_id : req.params.id;
    if (typeof workerId !== 'string' || !workerId || (ownOnly && workerId !== actorId)) return res.status(403).json({ error: 'Schedule access denied' });
    try {
      const worker = await prisma.user.findUnique({ where: { id: workerId }, select: { isDisabled: true, company_id: true, companies: { select: { companyId: true } } } });
      if (!worker || worker.isDisabled) return res.status(403).json({ error: 'Schedule access denied' });
      const companyIds = [...new Set([worker.company_id, ...worker.companies.map(link => link.companyId)].filter((id): id is string => Boolean(id)))];
      const allowed: string[] = [];
      for (const companyId of companyIds) {
        const permitted = actorId === workerId ? await canAccessCompanySubscription(actorId, companyId) : await canUseCompanyFeature(actorId, companyId, 'Projects');
        if (permitted) allowed.push(companyId);
      }
      if (!allowed.length) return res.status(403).json({ error: 'Schedule access denied' });
      (req as any).allowedScheduleCompanyIds = allowed;
      return next();
    } catch { return res.status(503).json({ error: 'Unable to verify schedule access' }); }
  };
}
export const requireOwnSchedule = requireWorkerSchedule(true);
