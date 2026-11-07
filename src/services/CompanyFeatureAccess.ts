import { prisma } from '../utils/prisma';
import { evaluateSubscriptionAccess } from './SubscriptionAccessDecision';

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
  const office = link?.office ?? (actor.company_id === companyId ? actor.office : null);
  // Existing legacy company creation reused offices; membership remains authoritative.
  if (!office || office.company_id !== companyId && !office.legacyPlanPermissions) return false;
  const company = await prisma.company.findUnique({ where: { id: companyId }, include: {
    Plan: { include: { permissionGroup: { include: { GroupPermissionsList: { include: { Permissions: true } } } } } },
  } });
  if (!company?.Plan) return false;
  const now = new Date();
  const subscriptions = await prisma.subscription.findMany({ where: { companyId, isActive: true,
    NOT: { plan: { validityType: 'FREE' }, endDate: { lte: now } } }, orderBy: { startDate: 'desc' }, take: 2,
  });
  const access = evaluateSubscriptionAccess({ companyId,
    plan: { ...company.Plan, permissions: company.Plan.permissionGroup.GroupPermissionsList.map(row => row.Permissions.description) },
    allowedEmployees: company.allowedEmployees ?? 0, extraEmployees: company.extraEmployees ?? 0,
    officeName: office.name, officePermissions: office.userPermissions.map(row => row.permission.description),
    legacyPlanPermissions: office.legacyPlanPermissions === true, hasCompanyAccess: true,
    pendingSubscription: company.mobileSubscriptionStatus === 'pending_subscription', subscriptions, now,
  });
  return access.decision === 'allow' && (feature === undefined || access.permissions.includes(feature));
}

export function canUseCompanyFeature(userId: string, companyId: string, feature: string): Promise<boolean> {
  if (!feature) return Promise.resolve(false);
  return checkCompanyAccess(userId, companyId, feature);
}
// Crew assignment checks use this only after verifying the concrete assigned work.
export function canAccessCompanySubscription(userId: string, companyId: string): Promise<boolean> {
  return checkCompanyAccess(userId, companyId);
}
