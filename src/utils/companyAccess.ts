import { prisma } from "./prisma";

export async function userHasCompanyAccess(userId: string | undefined, companyId: string | undefined) {
  if (!userId || !companyId) return false;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      company_id: true,
      companies: {
        where: { companyId },
        select: { companyId: true },
        take: 1,
      },
    },
  });

  return user?.company_id === companyId || user?.companies.some((company) => company.companyId === companyId) === true;
}

export async function sessionCanManageCompany(
  requestUserId: string | undefined,
  companyId: string | undefined,
  pathUserId?: string,
) {
  if (pathUserId && requestUserId !== pathUserId) return false;
  return userHasCompanyAccess(requestUserId, companyId);
}
