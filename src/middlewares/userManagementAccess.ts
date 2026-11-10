import { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../utils/prisma';
import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';
import { isOwnerOfficeName } from '../utils/ownerFullAccess';

export async function requireUserManagementAccess(req: Request, res: Response, next: NextFunction) {
  const actorId = (req as any).userId as string | undefined;
  if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const companyId = req.params.companyId ?? req.body?.company_id;
    const targetId = req.params.userId ?? req.params.id ?? req.body?.id ?? req.body?.userId;
    const companies = new Set<string>();
    let existingOfficeId: string | null = null;
    let currentOfficeId: string | null = null;
    if (companyId !== undefined) {
      if (typeof companyId !== 'string' || !companyId) return res.status(400).json({ error: 'Company is required' });
      companies.add(companyId);
    }
    if (targetId) {
      const target = await prisma.user.findUnique({ where: { id: targetId }, select: {
        office_id: true, company_id: true, companies: { select: { companyId: true, office_id: true } },
      } });
      existingOfficeId = target?.office_id ?? null;
      currentOfficeId = target?.companies.find(row => row.companyId === companyId)?.office_id ?? existingOfficeId;
      const targetCompanies = new Set(target?.companies.map(row => row.companyId) ?? []);
      if (target?.company_id) targetCompanies.add(target.company_id);
      if (!target || !targetCompanies.size || companyId && !targetCompanies.has(companyId)) return res.status(403).json({ error: 'User management access is required' });
      // Updating/deleting a global user affects every linked company. Unlinking is company-scoped.
      if (!req.params.companyId) targetCompanies.forEach(id => companies.add(id));
    }
    if (!companies.size) return res.status(400).json({ error: 'Company is required' });
    for (const id of companies) if (!await canUseCompanyFeature(actorId, id, 'User Management')) return res.status(403).json({ error: 'User management access is required' });
    // Create reads office_id and update reads office.id, so both must pass.
    const officeIds = [...new Set([req.body?.office_id, req.body?.office?.id].filter(Boolean))] as string[];
    for (const officeId of officeIds) {
      const office = await prisma.office.findUnique({ where: { id: officeId }, select: { name: true, company_id: true, legacyPlanPermissions: true } });
      if (!office || office.company_id !== companyId && !(office.legacyPlanPermissions && officeId === existingOfficeId) || office.name.trim().toLowerCase() === 'master') return res.status(403).json({ error: 'Office must belong to the selected company' });
    }
    // Only an Owner may change their own role; saving the same role stays allowed.
    if (targetId === actorId && officeIds.some(id => id !== currentOfficeId)) {
      const current = currentOfficeId ? await prisma.office.findUnique({ where: { id: currentOfficeId }, select: { name: true } }) : null;
      if (!isOwnerOfficeName(current?.name)) return res.status(403).json({ error: 'You cannot change your own role' });
    }
    return next();
  } catch {
    return res.status(503).json({ error: 'Unable to verify user management access' });
  }
}

// "Meu perfil" posts the whole session user without company_id. Only contact fields are
// applied, so role, status and pay in that body never reach the management update.
export function routeOwnProfileUpdate(saveProfile: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const actorId = (req as any).userId;
    if (!actorId || req.body?.id !== actorId || req.body?.company_id !== undefined) return next();
    const { id, name, email, phone } = req.body;
    req.body = { id, name, email, phone };
    return saveProfile(req, res, next);
  };
}

export function requireOwnUserRecord(req: Request, res: Response, next: NextFunction) {
  const actorId = (req as any).userId;
  if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
  if ((req.params.id ?? req.body?.id) !== actorId) return res.status(403).json({ error: 'Own user access is required' });
  return next();
}
