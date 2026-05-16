import { prisma } from "./prisma";

export type FullAccessFlag = "invoiceEditAll" | "projectEditAll" | "estimateEditAll";

export const OWNER_FULL_ACCESS_DATA = {
  invoiceEditAll: true,
  projectEditAll: true,
  estimateEditAll: true,
  projectVisibilityMode: "allActive",
} as const;

export function isOwnerOfficeName(name?: string | null) {
  return String(name || "").trim().toLowerCase() === "owner";
}

export async function userHasFullAccess(
  userId: string | undefined | null,
  flag: FullAccessFlag,
  companyId?: string | null
) {
  if (!userId) return false;

  if (companyId) {
    const userCompany = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId,
          companyId,
        },
      },
      select: {
        office: {
          select: {
            name: true,
          },
        },
      },
    });

    if (isOwnerOfficeName(userCompany?.office?.name)) {
      return true;
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      invoiceEditAll: true,
      projectEditAll: true,
      estimateEditAll: true,
      office: {
        select: {
          name: true,
        },
      },
    },
  });

  if (isOwnerOfficeName(user?.office?.name)) {
    return true;
  }

  return user?.[flag] === true;
}

export async function grantOwnerFullAccessForCompany(companyId: string) {
  const ownerCompanyLinks = await prisma.userCompany.findMany({
    where: {
      companyId,
      office: {
        name: {
          equals: "Owner",
        },
      },
    },
    select: {
      userId: true,
    },
  });

  const directOwnerUsers = await prisma.user.findMany({
    where: {
      company_id: companyId,
      office: {
        name: {
          equals: "Owner",
        },
      },
    },
    select: {
      id: true,
    },
  });

  const ownerUserIds = [
    ...new Set([
      ...ownerCompanyLinks.map((link) => link.userId),
      ...directOwnerUsers.map((user) => user.id),
    ]),
  ];

  if (ownerUserIds.length === 0) {
    return { count: 0 };
  }

  return prisma.user.updateMany({
    where: {
      id: {
        in: ownerUserIds,
      },
    },
    data: OWNER_FULL_ACCESS_DATA,
  });
}
