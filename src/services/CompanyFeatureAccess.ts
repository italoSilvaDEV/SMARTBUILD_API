import { prisma } from '../utils/prisma';
import { resolveEffectivePermissions } from '../utils/planPermissions';

// Route guards decide identity, company membership, role and plan. Subscription state is
// reported by the status endpoints: routes never denied on it and installed clients rely on that.
async function checkCompanyAccess(userId: string, companyId: string, feature?: string): Promise<boolean> {
  const actor = await prisma.user.findUnique({ where: { id: userId }, include: {
    office: { include: { userPermissions: { include: { permission: true } } } },
    companies: { include: { office: { include: { userPermissions: { include: { permission: true } } } } } },
  } });
  if (!actor || actor.isDisabled) return false;
  const master = actor.office?.name.trim().toLowerCase() === 'master' && actor.office.company_id == null
    && actor.company_id == null && actor.companies.length === 0;
  if (master) return true;
  const link = actor.companies.find(row => row.companyId === companyId);
  if (!link && actor.company_id !== companyId) return false;
  if (feature === undefined) return true;
  const office = link?.office ?? actor.office;
  // Existing legacy company creation reused offices; membership remains authoritative.
  if (!office || office.company_id !== companyId && !office.legacyPlanPermissions) return false;
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: {
    Plan: { include: { permissionGroup: { include: { GroupPermissionsList: { include: { Permissions: true } } } } } },
  } });
  if (!company) return false;
  const officePermissions = office.userPermissions.map(row => row.permission.description);
  if (!company.Plan) {
    // No plan to intersect with: the role alone decides.
    return ['owner', 'administrator'].includes(office.name.trim().toLowerCase()) || officePermissions.includes(feature);
  }
  const planPermissions = company.Plan.permissionGroup.GroupPermissionsList.map(row => row.Permissions.description);
  return resolveEffectivePermissions(planPermissions, officePermissions, office.name, office.legacyPlanPermissions === true).includes(feature);
}

export function canUseCompanyFeature(userId: string, companyId: string, feature: string): Promise<boolean> {
  if (!feature) return Promise.resolve(false);
  return checkCompanyAccess(userId, companyId, feature);
}
// Crew assignment checks use this only after verifying the concrete assigned work.
export function canAccessCompanySubscription(userId: string, companyId: string): Promise<boolean> {
  return checkCompanyAccess(userId, companyId);
}
