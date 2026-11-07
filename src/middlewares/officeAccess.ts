import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/prisma';

// Resolve the stored office's company before trusting company IDs supplied by the caller.
export async function requireOfficeAccess(req: Request, res: Response, next: NextFunction) {
  const userId = (req as any).userId as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const writing = req.method !== 'GET';
  const supplied = [req.params.companyId, req.query.companyId, req.body?.companyId].filter(v => v !== undefined);
  if (supplied.some(v => typeof v !== 'string' || !v) || new Set(supplied).size > 1) {
    return res.status(400).json({ error: 'A consistent company ID is required' });
  }
  try {
    const target = req.params.id ? await prisma.office.findUnique({ where: { id: req.params.id }, select: { company_id: true } }) : null;
    const companyId = req.params.id ? target?.company_id : supplied[0] as string | undefined;
    if (!companyId || (supplied.length && supplied[0] !== companyId)) return res.status(403).json({ error: 'Company access is required' });
    const officeSelect = { name: true, company_id: true, legacyPlanPermissions: true, userPermissions: { select: { permission: { select: { id: true, description: true } } } } } as const;
    const actor = await prisma.user.findUnique({ where: { id: userId }, select: {
      isDisabled: true, company_id: true, office: { select: officeSelect },
      companies: { select: { companyId: true, office: { select: officeSelect } } },
    } });
    if (!actor || actor.isDisabled) return res.status(403).json({ error: 'Company access is required' });
    const globalMaster = actor.office?.name.trim().toLowerCase() === 'master' && actor.office.company_id == null
      && actor.company_id == null && actor.companies.length === 0;
    const link = actor.companies.find(item => item.companyId === companyId);
    const office = link?.office ?? (actor.company_id === companyId ? actor.office : null);
    if (!globalMaster && (!office || office.company_id !== companyId && !office.legacyPlanPermissions)) return res.status(403).json({ error: 'Company access is required' });
    if (writing) {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: {
        Plan: { select: { permissionGroup: { select: { GroupPermissionsList: { select: { Permissions: { select: { id: true, description: true } } } } } } } },
      } });
      const planPermissions = company?.Plan?.permissionGroup.GroupPermissionsList.map(row => row.Permissions) ?? [];
      const manager = ['owner', 'administrator'].includes(office?.name.trim().toLowerCase() ?? '');
      const delegatedManager = office?.userPermissions.some(row => row.permission.description === 'User Management'
        && planPermissions.some(permission => permission.id === row.permission.id));
      if (!globalMaster && !manager && !delegatedManager) return res.status(403).json({ error: 'Company administrator access is required' });
      if (!await canUseCompanyFeature(userId, companyId, 'User Management')) return res.status(403).json({ error: 'User Management is not available for this subscription and role' });
      if (req.body?.permissions !== undefined) {
        if (!Array.isArray(req.body.permissions) || req.body.permissions.some((id: unknown) => typeof id !== 'string' || !id)
          || new Set(req.body.permissions).size !== req.body.permissions.length) return res.status(400).json({ error: 'Invalid permissions' });
        const allowed = new Set(planPermissions.map(permission => permission.id));
        if (req.body.permissions.some((id: string) => !allowed.has(id))) return res.status(403).json({ error: 'Permissions must belong to the company plan' });
      }
    }
    return next();
  } catch (error) {
    console.error('[requireOfficeAccess] Authorization unavailable');
    return res.status(503).json({ error: 'Unable to verify company access' });
  }
}
