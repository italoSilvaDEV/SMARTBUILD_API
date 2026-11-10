import { prisma } from "../utils/prisma";
import { resolveEffectivePermissions } from "../utils/planPermissions";

export interface HelpAccess {
  userName: string;
  officeName: string | null;
  companyId: string;
  companyName: string | null;
  permissions: string[];
  fullProjectAccess: boolean;
  visibleProjectIds: string[] | null;
  invoiceAccessAll: boolean;
}

/** Mesma regra do app (userHasFullAccess): só o cargo Owner tem acesso total sem a flag do usuário. */
const isOwner = (name: string | null) => String(name ?? "").trim().toLowerCase() === "owner";

/**
 * Resolve, no servidor, a empresa e as permissões do usuário.
 * Segue a mesma regra do login: permissões do plano da empresa filtradas
 * pelas do cargo (Owner/Administrator recebem todas as do plano (permissões de tela; o acesso a todos os projetos/faturas segue userHasFullAccess)).
 * Retorna null se o usuário não pertence à empresa.
 */
export async function resolveHelpAccess(userId: string, requestedCompanyId: string | null): Promise<HelpAccess | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      company_id: true,
      projectEditAll: true,
      invoiceEditAll: true,
      office: { select: { name: true, legacyPlanPermissions: true, userPermissions: { select: { permission: { select: { description: true } } } } } },
    },
  });
  if (!user) return null;

  const companyId = requestedCompanyId || user.company_id;
  if (!companyId) return null;

  let office = user.company_id === companyId ? user.office : null;
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      office: { select: { name: true, legacyPlanPermissions: true, userPermissions: { select: { permission: { select: { description: true } } } } } },
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

  const fullProjectAccess = isOwner(officeName) || user.projectEditAll === true;
  const invoiceAccessAll = isOwner(officeName) || user.invoiceEditAll === true;
  // Mesma regra da tela Projects: sem acesso total, só projetos em que é vendedor ou gerente.
  const visibleProjectIds = fullProjectAccess
    ? null
    : (
        await prisma.project.findMany({
          where: { company_id: companyId, OR: [{ seller_user_id: userId }, { project_manager_id: userId }] },
          select: { id: true },
        })
      ).map((project) => project.id);

  return {
    userName: user.name,
    officeName,
    companyId,
    companyName: company.name,
    permissions: resolveEffectivePermissions(planPermissions, officePermissions, officeName, office?.legacyPlanPermissions === true),
    fullProjectAccess,
    visibleProjectIds,
    invoiceAccessAll,
  };
}
