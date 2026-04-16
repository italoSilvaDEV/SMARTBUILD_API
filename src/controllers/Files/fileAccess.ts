import { prisma } from "../../utils/prisma";

export async function getUserCompanyIds(userId: string): Promise<string[]> {
    const user = await prisma.user.findUnique({
        where: {
            id: userId
        },
        select: {
            company_id: true,
            companies: {
                select: {
                    companyId: true
                }
            }
        }
    });

    if (!user) {
        return [];
    }

    return Array.from(new Set([
        user.company_id,
        ...user.companies.map((company) => company.companyId)
    ].filter((companyId): companyId is string => !!companyId)));
}

export async function userHasAccessToCompany(userId: string, companyId?: string | null): Promise<boolean> {
    if (!companyId) {
        return false;
    }

    const userCompanyIds = await getUserCompanyIds(userId);
    return userCompanyIds.includes(companyId);
}
