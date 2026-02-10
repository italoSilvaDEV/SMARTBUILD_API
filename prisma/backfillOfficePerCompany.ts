/// <reference types="node" />
import { config } from "dotenv";
import { resolve } from "path";
import { existsSync } from "fs";

const envPaths = [
  resolve(__dirname, "../.env"),
  resolve(process.cwd(), ".env"),
  resolve(__dirname, "../.env.local"),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log(`✓ Variáveis de ambiente carregadas: ${envPath}\n`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn("  Arquivo .env não encontrado. Usando variáveis do sistema...\n");
  config();
}

if (!process.env.DATABASE_URL) {
  console.error(" DATABASE_URL não encontrada! Defina no .env e tente novamente.\n");
  process.exit(1);
}

import { prisma } from "../src/utils/prisma";

/** Retorna os IDs de permissão do plano da empresa (PermissionGroup → GroupPermissionsList). */
function getPlanPermissionIds(company: {
  Plan?: {
    permissionGroup?: {
      GroupPermissionsList: Array<{ permission_id: string }>;
    };
  } | null;
}): string[] {
  const list = company.Plan?.permissionGroup?.GroupPermissionsList ?? [];
  const ids = list.map((gpl) => gpl.permission_id);
  return [...new Set(ids)];
}

/** Candidato a owner: userId + data mais antiga (User.date_creation ou UserCompany.createdAt). */
type OwnerCandidate = { userId: string; date: Date };

/**
 * Define o userId que deve ser owner da empresa: o que tem a data de vínculo mais antiga.
 * Considera User (company_id + date_creation) e UserCompany (companyId + createdAt).
 * Se o mesmo usuário aparecer nas duas fontes, usa a data mais antiga entre elas.
 */
async function getOwnerUserIdByOldestDate(companyId: string): Promise<OwnerCandidate | null> {
  const [usersInCompany, userCompanyRows] = await Promise.all([
    prisma.user.findMany({
      where: { company_id: companyId },
      select: { id: true, date_creation: true },
    }),
    prisma.userCompany.findMany({
      where: { companyId },
      select: { userId: true, createdAt: true },
    }),
  ]);

  const byUser = new Map<string, Date>();

  for (const u of usersInCompany) {
    const d = u.date_creation ?? new Date(0);
    const existing = byUser.get(u.id);
    if (!existing || d.getTime() < existing.getTime()) byUser.set(u.id, d);
  }
  for (const uc of userCompanyRows) {
    const d = uc.createdAt ?? new Date(0);
    const existing = byUser.get(uc.userId);
    if (!existing || d.getTime() < existing.getTime()) byUser.set(uc.userId, d);
  }

  if (byUser.size === 0) return null;

  let oldest: OwnerCandidate | null = null;
  for (const [userId, date] of byUser) {
    if (!oldest || date.getTime() < oldest.date.getTime()) {
      oldest = { userId, date };
    }
  }
  return oldest;
}

/**
 * Atribui o usuário ao office Owner da empresa: cria ou atualiza UserCompany e sincroniza User.office_id.
 */
async function assignUserToOwnerOffice(params: {
  userId: string;
  companyId: string;
  ownerOfficeId: string;
}): Promise<void> {
  const { userId, companyId, ownerOfficeId } = params;

  const existing = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });

  if (existing) {
    await prisma.userCompany.update({
      where: { userId_companyId: { userId, companyId } },
      data: { office_id: ownerOfficeId },
    });
  } else {
    await prisma.userCompany.create({
      data: { userId, companyId, office_id: ownerOfficeId },
    });
  }

  // Atualiza só office_id via raw para não depender de colunas novas do schema (ex.: attendanceMode)
  await prisma.$executeRaw`UPDATE \`User\` SET office_id = ${ownerOfficeId} WHERE id = ${userId}`;
}

async function main() {
  console.log(" Iniciando backfill Office por Companhia...\n");

  // Referência: o perfil (office) do usuário em cada empresa é UserCompany.office_id.
  // User.office_id é mantido em sync para FK e como fallback; a fonte de verdade por empresa é UserCompany.

  // ========== ETAPA 0: Migração de dados — atribuir ou duplicar office por company ==========
  const officesWithoutCompany = await prisma.office.findMany({
    where: { company_id: null },
    include: {
      userPermissions: { select: { permission_id: true } },
      UserCompany: { select: { userId: true, companyId: true } },
    },
  });

  console.log(` Offices sem company_id: ${officesWithoutCompany.length}`);

  for (const office of officesWithoutCompany) {
    const companyIds = [...new Set(office.UserCompany.map((uc) => uc.companyId))];

    if (companyIds.length === 0) {
      console.warn(`  Office "${office.name}" (${office.id}) não usada por nenhuma company. Pulando.`);
      continue;
    }

    if (companyIds.length === 1) {
      await prisma.office.update({
        where: { id: office.id },
        data: { company_id: companyIds[0] },
      });
      console.log(`  Office "${office.name}" atribuída à company ${companyIds[0]}`);
      continue;
    }

    const permissionIds = office.userPermissions.map((up) => up.permission_id);
    const newOfficeIds: string[] = [];
    for (const companyId of companyIds) {
      const [newOffice] = await prisma.$transaction([
        prisma.office.create({
          data: {
            name: office.name,
            company_id: companyId,
            userPermissions:
              permissionIds.length > 0
                ? { create: permissionIds.map((permission_id) => ({ permission_id, editAll: false })) }
                : undefined,
          },
        }),
      ]);
      newOfficeIds.push(newOffice.id);
      await prisma.userCompany.updateMany({
        where: { office_id: office.id, companyId: companyId },
        data: { office_id: newOffice.id },
      });
      console.log(`  Office "${office.name}" duplicada para company ${companyId} (nova id: ${newOffice.id})`);
    }
    // User.office_id pode ainda apontar para a office antiga; atualizar para uma das novas
    const usersWithOldOffice = await prisma.user.findMany({
      where: { office_id: office.id },
      select: { id: true },
    });
    const fallbackOfficeId = newOfficeIds[0];
    for (const u of usersWithOldOffice) {
      const uc = await prisma.userCompany.findFirst({
        where: { userId: u.id },
        select: { office_id: true },
      });
      const targetOfficeId = uc?.office_id ?? fallbackOfficeId;
      // Atualiza só office_id via raw para não depender de colunas novas do schema (ex.: attendanceMode)
      await prisma.$executeRaw`UPDATE \`User\` SET office_id = ${targetOfficeId} WHERE id = ${u.id}`;
    }
    await prisma.userPermission.deleteMany({ where: { office_id: office.id } });
    await prisma.office.delete({ where: { id: office.id } });
    console.log(`  Office original "${office.name}" (${office.id}) removida.`);
  }

  // ========== ETAPA 1: Por cada company — Administrator, Worker, Owner (permissões do plano); Master/Worker sem permissões ==========
  const companies = await prisma.company.findMany({
    include: {
      Plan: {
        include: {
          permissionGroup: {
            include: {
              GroupPermissionsList: { select: { permission_id: true } },
            },
          },
        },
      },
    },
  });

  let createdAdmin = 0;
  let createdWorker = 0;
  let createdOwner = 0;
  const adminByCompany = new Map<string, string>();
  const workerByCompany = new Map<string, string>();
  const ownerByCompany = new Map<string, string>();
  /** Relatório: owner definido por empresa (apenas quando office Owner foi criada e havia usuário para atribuir). */
  const ownerCreatedByCompany: Array<{
    companyId: string;
    companyName: string;
    ownerUserId: string;
    ownerName: string;
    ownerEmail: string;
  }> = [];

  for (const company of companies) {
    const existingOffices = await prisma.office.findMany({
      where: { company_id: company.id },
      select: { id: true, name: true },
    });

    const planPermissionIds = getPlanPermissionIds(company);

    const hasAdmin = existingOffices.some((o) => o.name.toLowerCase() === "administrator");
    const hasWorker = existingOffices.some((o) => o.name.toLowerCase() === "worker");
    const hasOwner = existingOffices.some((o) => o.name.toLowerCase() === "owner");
    const masterOffice = existingOffices.find((o) => o.name.toLowerCase() === "master");
    const workerOffice = existingOffices.find((o) => o.name.toLowerCase() === "worker");

    // — Administrator: permissões do plano (criar se não existir; se existir, sincronizar userPermissions com o plano)
    if (!hasAdmin) {
      const newAdmin = await prisma.office.create({
        data: {
          name: "Administrator",
          company_id: company.id,
          userPermissions:
            planPermissionIds.length > 0
              ? { create: planPermissionIds.map((permission_id) => ({ permission_id, editAll: false })) }
              : undefined,
        },
      });
      adminByCompany.set(company.id, newAdmin.id);
      createdAdmin++;
      console.log(`  Company "${company.name}" — office Administrator criada (${newAdmin.id}) com ${planPermissionIds.length} permissões do plano`);
    } else {
      const existingAdmin = existingOffices.find((o) => o.name.toLowerCase() === "administrator");
      if (existingAdmin) {
        adminByCompany.set(company.id, existingAdmin.id);
        await prisma.userPermission.deleteMany({ where: { office_id: existingAdmin.id } });
        if (planPermissionIds.length > 0) {
          await prisma.userPermission.createMany({
            data: planPermissionIds.map((permission_id) => ({
              office_id: existingAdmin.id,
              permission_id,
              editAll: false,
            })),
          });
        }
        console.log(`  Company "${company.name}" — Administrator existente: userPermissions sincronizadas com o plano (${planPermissionIds.length} permissões)`);
      }
    }

    // — Worker: sem permissões (criar se não existir; se existir, remover todas as permissões)
    if (!hasWorker) {
      const newWorker = await prisma.office.create({
        data: { name: "Worker", company_id: company.id },
      });
      workerByCompany.set(company.id, newWorker.id);
      createdWorker++;
      console.log(`  Company "${company.name}" — office Worker criada (${newWorker.id}, sem permissões)`);
    } else {
      if (workerOffice) {
        workerByCompany.set(company.id, workerOffice.id);
        const deleted = await prisma.userPermission.deleteMany({ where: { office_id: workerOffice.id } });
        if (deleted.count > 0) {
          console.log(`  Company "${company.name}" — Worker: ${deleted.count} permissões removidas (perfil sem permissões)`);
        }
      }
    }

    // — Master: garantir zero permissões (perfil master não tem permissões)
    if (masterOffice) {
      const deleted = await prisma.userPermission.deleteMany({ where: { office_id: masterOffice.id } });
      if (deleted.count > 0) {
        console.log(`  Company "${company.name}" — Master: ${deleted.count} permissões removidas (perfil sem permissões)`);
      }
    }

    // — Owner: uma por empresa, com todas as permissões do plano (criar se não existir; se existir, sincronizar)
    if (!hasOwner) {
      const newOwner = await prisma.office.create({
        data: {
          name: "Owner",
          company_id: company.id,
          userPermissions:
            planPermissionIds.length > 0
              ? { create: planPermissionIds.map((permission_id) => ({ permission_id, editAll: false })) }
              : undefined,
        },
      });
      ownerByCompany.set(company.id, newOwner.id);
      createdOwner++;

      const ownerCandidate = await getOwnerUserIdByOldestDate(company.id);
      if (ownerCandidate) {
        await assignUserToOwnerOffice({
          userId: ownerCandidate.userId,
          companyId: company.id,
          ownerOfficeId: newOwner.id,
        });
        const ownerUser = await prisma.user.findUnique({
          where: { id: ownerCandidate.userId },
          select: { name: true, email: true },
        });
        ownerCreatedByCompany.push({
          companyId: company.id,
          companyName: company.name,
          ownerUserId: ownerCandidate.userId,
          ownerName: ownerUser?.name ?? "(sem nome)",
          ownerEmail: ownerUser?.email ?? "(sem email)",
        });
      }

      console.log(`  Company "${company.name}" — office Owner criada (${newOwner.id}) com ${planPermissionIds.length} permissões do plano`);
    } else {
      const existingOwner = existingOffices.find((o) => o.name.toLowerCase() === "owner");
      if (existingOwner) {
        ownerByCompany.set(company.id, existingOwner.id);
        await prisma.userPermission.deleteMany({ where: { office_id: existingOwner.id } });
        if (planPermissionIds.length > 0) {
          await prisma.userPermission.createMany({
            data: planPermissionIds.map((permission_id) => ({
              office_id: existingOwner.id,
              permission_id,
              editAll: false,
            })),
          });
        }
        console.log(`  Company "${company.name}" — Owner existente: userPermissions sincronizadas com o plano (${planPermissionIds.length} permissões)`);
      }
    }
  }

  // ========== ETAPA 2: Seller -> Administrator; Worker -> Worker da company ==========
  const userCompanies = await prisma.userCompany.findMany({
    include: { office: { select: { name: true } } },
  });

  let sellerToAdmin = 0;
  let workerReassigned = 0;

  for (const uc of userCompanies) {
    const name = uc.office?.name?.toLowerCase() ?? "";
    const adminId = adminByCompany.get(uc.companyId);
    const workerId = workerByCompany.get(uc.companyId);

    if (name === "seller" && adminId) {
      await prisma.userCompany.update({
        where: { userId_companyId: { userId: uc.userId, companyId: uc.companyId } },
        data: { office_id: adminId },
      });
      sellerToAdmin++;
    } else if (name === "worker" && workerId && uc.office_id !== workerId) {
      await prisma.userCompany.update({
        where: { userId_companyId: { userId: uc.userId, companyId: uc.companyId } },
        data: { office_id: workerId },
      });
      workerReassigned++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(" RESUMO:");
  console.log(`  Total de empresas: ${companies.length}`);
  console.log(`  Administrator criados: ${createdAdmin}`);
  console.log(`  Worker criados: ${createdWorker}`);
  console.log(`  Owner criados: ${createdOwner}`);
  console.log(`  Owners atribuídos (usuário com data mais antiga): ${ownerCreatedByCompany.length}`);
  console.log(`  Seller -> Administrator: ${sellerToAdmin}`);
  console.log(`  Worker reassignados: ${workerReassigned}`);
  console.log("=".repeat(60));

  if (ownerCreatedByCompany.length > 0) {
    console.log("\n OWNER CRIADO POR EMPRESA:");
    for (const row of ownerCreatedByCompany) {
      console.log(`  • ${row.companyName} (${row.companyId}) → ${row.ownerName} (${row.ownerEmail}) [userId: ${row.ownerUserId}]`);
    }
  }

  console.log("\nBackfill concluído com sucesso!");
}

main()
  .catch((e) => {
    console.error("\n Erro durante o backfill:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
