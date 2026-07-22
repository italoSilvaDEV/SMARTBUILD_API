import { randomUUID } from 'crypto';

import { prisma } from '../utils/prisma';

const CORE_PLAN_ID = '2b82d6f3-6977-4908-9610-85728abe86b2';
const FULL_PLAN_ID = '7edba762-c782-4132-b1cb-ad32f0236671';

const CORE_GROUP_NAME = 'SmartBuild Mobile Core';
const FULL_GROUP_NAME = 'SmartBuild Mobile Full';

const CORE_PERMISSION_NAMES = [
  'Dashboard Simple',
  'Estimates',
  'Clients',
  'Services',
  'Invoice',
  'Projects',
] as const;

type PlanSyncConfig = {
  groupId: string;
  permissionIds: string[];
  planId: string;
};

async function main() {
  const result = await prisma.$transaction(
    async (tx) => {
      const plans = await tx.plan.findMany({
        where: { id: { in: [CORE_PLAN_ID, FULL_PLAN_ID] } },
        select: { id: true, name: true },
      });

      const foundPlanIds = new Set(plans.map((plan) => plan.id));
      const missingPlanIds = [CORE_PLAN_ID, FULL_PLAN_ID].filter(
        (planId) => !foundPlanIds.has(planId),
      );

      if (missingPlanIds.length > 0) {
        throw new Error(`Mobile plans not found: ${missingPlanIds.join(', ')}`);
      }

      const allPermissions = await tx.permissions.findMany({
        orderBy: { description: 'asc' },
        select: { description: true, id: true },
      });
      const permissionsByName = new Map(
        allPermissions.map((permission) => [permission.description, permission.id]),
      );
      const missingCorePermissions = CORE_PERMISSION_NAMES.filter(
        (permission) => !permissionsByName.has(permission),
      );

      if (missingCorePermissions.length > 0) {
        throw new Error(
          `Required permissions not found: ${missingCorePermissions.join(', ')}`,
        );
      }

      const coreGroup =
        (await tx.permissionGroup.findFirst({
          where: { description: CORE_GROUP_NAME },
          select: { id: true },
        })) ??
        (await tx.permissionGroup.create({
          data: { description: CORE_GROUP_NAME },
          select: { id: true },
        }));
      const fullGroup =
        (await tx.permissionGroup.findFirst({
          where: { description: FULL_GROUP_NAME },
          select: { id: true },
        })) ??
        (await tx.permissionGroup.create({
          data: { description: FULL_GROUP_NAME },
          select: { id: true },
        }));

      const configs: PlanSyncConfig[] = [
        {
          groupId: coreGroup.id,
          permissionIds: CORE_PERMISSION_NAMES.map(
            (permission) => permissionsByName.get(permission)!,
          ),
          planId: CORE_PLAN_ID,
        },
        {
          groupId: fullGroup.id,
          permissionIds: allPermissions.map((permission) => permission.id),
          planId: FULL_PLAN_ID,
        },
      ];

      await tx.groupPermissionsList.deleteMany({
        where: { permission_group: { in: configs.map((config) => config.groupId) } },
      });

      const now = new Date();
      await tx.groupPermissionsList.createMany({
        data: configs.flatMap((config) =>
          config.permissionIds.map((permissionId) => ({
            date_creation: now,
            date_update: now,
            id: randomUUID(),
            permission_group: config.groupId,
            permission_id: permissionId,
          })),
        ),
      });

      for (const config of configs) {
        await tx.plan.update({
          where: { id: config.planId },
          data: { permissionGroupId: config.groupId },
        });
      }

      const officeUpdates: Array<{
        offices: number;
        permissions: number;
        planId: string;
      }> = [];

      for (const config of configs) {
        const companies = await tx.company.findMany({
          where: { planId: config.planId },
          select: { id: true },
        });
        const companyIds = companies.map((company) => company.id);
        const offices = companyIds.length
          ? await tx.office.findMany({
              where: {
                company_id: { in: companyIds },
                name: { in: ['Owner', 'Administrator'] },
              },
              select: { id: true },
            })
          : [];
        const officeIds = offices.map((office) => office.id);

        if (officeIds.length > 0) {
          await tx.userPermission.deleteMany({
            where: { office_id: { in: officeIds } },
          });
          await tx.userPermission.createMany({
            data: officeIds.flatMap((officeId) =>
              config.permissionIds.map((permissionId) => ({
                date_creation: now,
                date_update: now,
                editAll: false,
                id: randomUUID(),
                office_id: officeId,
                permission_id: permissionId,
              })),
            ),
          });
        }

        officeUpdates.push({
          offices: officeIds.length,
          permissions: config.permissionIds.length,
          planId: config.planId,
        });
      }

      return {
        groups: {
          core: coreGroup.id,
          full: fullGroup.id,
        },
        officeUpdates,
      };
    },
    { maxWait: 10_000, timeout: 60_000 },
  );

  console.log('[Mobile plans] Permission sync completed.');
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error('[Mobile plans] Permission sync failed.', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
