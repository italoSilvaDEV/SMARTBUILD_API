import { prisma } from "../utils/prisma";
import { resolveEffectivePermissions } from "../utils/planPermissions";

export interface HelpAccess {
  userName: string;
  officeName: string | null;
  companyId: string;
  companyName: string | null;
  permissions: string[];
  fullProjectAccess: boolean;
}

const FULL_ACCESS_OFFICES = new Set(["owner", "administrator"]);

/**
 * Resolve, no servidor, a empresa e as permissões do usuário.
 * Segue a mesma regra do login: permissões do plano da empresa filtradas
 * pelas do cargo (Owner/Administrator recebem todas as do plano).
 * Retorna null se o usuário não pertence à empresa.
 */
export async function resolveHelpAccess(userId: string, requestedCompanyId: string | null): Promise<HelpAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      company_id: true,
      projectEditAll: true,
      office: { select: { name: true, userPermissions: { select: { permission: { select: { description: true } } } } } },
    },
  });
  if (!user) return null;

  const companyId = requestedCompanyId || user.company_id;
  if (!companyId) return null;

  let office = user.company_id === companyId ? user.office : null;
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      office: { select: { name: true, userPermissions: { select: { permission: { select: { description: true } } } } } },
    },
  });
  if (membership) office = membership.office;
  if (!office && user.company_id !== companyId) return null;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      Plan: {
        select: {
          permissionGroup: {
            select: { GroupPermissionsList: { select: { Permissions: { select: { description: true } } } } },
          },
        },
      },
    },
  });
  if (!company) return null;

  const planPermissions =
    company.Plan?.permissionGroup?.GroupPermissionsList.map((item) => item.Permissions.description) ?? [];
  const officePermissions = office?.userPermissions.map((item) => item.permission.description) ?? [];
  const officeName = office?.name ?? null;

  return {
    userName: user.name,
    officeName,
    companyId,
    companyName: company.name,
    permissions: resolveEffectivePermissions(planPermissions, officePermissions, officeName),
    fullProjectAccess: FULL_ACCESS_OFFICES.has(String(officeName ?? "").trim().toLowerCase()) || user.projectEditAll === true,
  };
}
