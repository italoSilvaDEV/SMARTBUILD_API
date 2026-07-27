import { prisma } from "./prisma";

const FINANCIAL_OFFICE_NAMES = new Set([
  "owner",
  "administrator",
  "master",
]);

function normalizeOfficeName(name?: string | null): string {
  return name?.trim().toLowerCase() ?? "";
}

export function isFinancialOfficeName(name?: string | null): boolean {
  return FINANCIAL_OFFICE_NAMES.has(normalizeOfficeName(name));
}

export async function userCanViewFinancials(
  userId?: string | null,
  companyId?: string | null
): Promise<boolean> {
  if (!userId || !companyId) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      company_id: true,
      office: {
        select: {
          name: true,
        },
      },
      companies: {
        where: { companyId },
        take: 1,
        select: {
          office: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!user) {
    return false;
  }

  // Master is a platform-wide role and may operate across companies.
  if (normalizeOfficeName(user.office?.name) === "master") {
    return true;
  }

  const companyOfficeName = user.companies[0]?.office?.name;
  if (isFinancialOfficeName(companyOfficeName)) {
    return true;
  }

  // Legacy single-company users may not have a UserCompany row yet.
  return (
    user.company_id === companyId &&
    isFinancialOfficeName(user.office?.name)
  );
}
