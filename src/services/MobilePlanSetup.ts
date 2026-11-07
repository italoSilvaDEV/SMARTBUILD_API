import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { grantOwnerFullAccessForCompany } from '../utils/ownerFullAccess';
type MobilePlan = {
    id: string;
    allowedEmployees: number | null;
    permissionGroup: {
        GroupPermissionsList: {
            permission_id: string;
        }[];
    };
};
async function applyPermissionsToOffice(officeId: string, permissionIds: string[], db: Prisma.TransactionClient) {
    if (permissionIds.length === 0)
        return;
    await db.userPermission.createMany({
        data: permissionIds.map((permission_id) => ({
            office_id: officeId,
            permission_id,
            editAll: false,
        })),
    });
}
export async function ensureCompanyPlanSetup(companyId: string, plan: MobilePlan, db: Prisma.TransactionClient = prisma) {
    const permissionIds = plan.permissionGroup.GroupPermissionsList.map((item) => item.permission_id);
    await db.company.update({
        where: { id: companyId },
        data: {
            planId: plan.id,
            allowedEmployees: plan.allowedEmployees,
            mobileSubscriptionStatus: "active",
        },
    });
    const ownerOffice = await db.office.findFirst({ where: { company_id: companyId, name: "Owner" }, include: { userPermissions: true } });
    if (ownerOffice && ownerOffice.userPermissions.length === 0)
        await applyPermissionsToOffice(ownerOffice.id, permissionIds, db);
    const workerOffice = await db.office.findFirst({ where: { company_id: companyId, name: "Worker" } });
    if (!workerOffice) {
        await db.office.create({ data: { name: "Worker", company_id: companyId } });
    }
    let adminOffice = await db.office.findFirst({ where: { company_id: companyId, name: "Administrator" } });
    if (!adminOffice) {
        adminOffice = await db.office.create({ data: { name: "Administrator", company_id: companyId } });
        await applyPermissionsToOffice(adminOffice.id, permissionIds, db);
    }
    await grantOwnerFullAccessForCompany(companyId, db);
}
