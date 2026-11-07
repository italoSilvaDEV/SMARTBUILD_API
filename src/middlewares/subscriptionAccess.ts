import { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { sessionCanManageCompany } from '../utils/companyAccess';

/** Authorize subscription reads by the resource's company, never a body-supplied ID. */
export async function requireSubscriptionReadAccess(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        isDisabled: true, company_id: true,
        office: { select: { name: true, company_id: true } },
        companies: { select: { companyId: true } },
      },
    });
    if (!user || user.isDisabled) return res.status(403).json({ error: 'Access denied' });
    // Same platform Master criteria as requireMaster; a tenant-created office is not a Master.
    const master = user.office?.name?.trim().toLowerCase() === 'master'
      && user.office.company_id == null && user.company_id == null && user.companies.length === 0;
    if (master) return next();
    const companyId = req.params.companyId || (await prisma.subscription.findUnique({
      where: { id: req.params.id }, select: { companyId: true },
    }))?.companyId;
    if (!companyId || !(user.company_id === companyId || user.companies.some(link => link.companyId === companyId))) {
      // Do not expose whether an inaccessible subscription exists.
      return res.status(403).json({ error: 'Access denied' });
    }
    return next();
  } catch (error) {
    console.error('[subscriptionAccess] Unable to authorize read', error);
    return res.status(503).json({ error: 'Unable to verify subscription access' });
  }
}

/** The status payload includes permissions for the named user, so it is self-service only. */
export async function requireOwnSubscriptionStatus(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    if (!await sessionCanManageCompany(userId, req.params.company_id, req.params.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    return next();
  } catch (error) {
    console.error('[subscriptionAccess] Unable to authorize status', error);
    return res.status(503).json({ error: 'Unable to verify subscription access' });
  }
}
