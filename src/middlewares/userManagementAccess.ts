import { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';

export async function requireUserManagementAccess(req: Request, res: Response, next: NextFunction) {
  const actorId = (req as any).userId as string | undefined;
  if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const companyId = req.params.companyId ?? req.body?.company_id;
    const targetId = req.params.userId ?? req.params.id ?? req.body?.id ?? req.body?.userId;
    const companies = new Set<string>();
    let existingOfficeId: string | null = null;
    if (companyId !== undefined) {
      if (typeof companyId !== 'string' || !companyId) return res.status(400).json({ error: 'Company is required' });
      companies.add(companyId);
    }
    if (targetId) {
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: {
        office_id: true, company_id: true, companies: { select: { companyId: true } },
      } });
      existingOfficeId = target?.office_id ?? null;
      const targetCompanies = new Set(target?.companies.map(row => row.companyId) ?? []);
      if (target?.company_id) targetCompanies.add(target.company_id);
      if (!target || !targetCompanies.size || companyId && !targetCompanies.has(companyId)) return res.status(403).json({ error: 'User management access is required' });
      // Updating/deleting a global user affects every linked company. Unlinking is company-scoped.
      if (!req.params.companyId) targetCompanies.forEach(id => companies.add(id));
    }
    if (!companies.size) return res.status(400).json({ error: 'Company is required' });
    for (const id of companies) if (!await canUseCompanyFeature(actorId, id, 'User Management')) return res.status(403).json({ error: 'User management access is required' });
    const officeId = req.body?.office_id ?? req.body?.office?.id;
    if (officeId) {
      const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true, company_id: true, legacyPlanPermissions: true } });
      if (!office || office.company_id !== companyId && !(office.legacyPlanPermissions && officeId === existingOfficeId) || office.name.trim().toLowerCase() === 'master') return res.status(403).json({ error: 'Office must belong to the selected company' });
    }
    return next();
  } catch {
    return res.status(503).json({ error: 'Unable to verify user management access' });
  }
}

export function requireOwnUserRecord(req: Request, res: Response, next: NextFunction) {
  const actorId = (req as any).userId;
  if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
  if ((req.params.id ?? req.body?.id) !== actorId) return res.status(403).json({ error: 'Own user access is required' });
  return next();
}
