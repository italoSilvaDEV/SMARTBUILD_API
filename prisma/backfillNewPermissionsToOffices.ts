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

// ========== TESTE: definir para rodar em uma única empresa; null = todas as empresas ==========
const TEST_COMPANY_ID: string | null = null; // Ex: "39d18951-980e-4d13-97d2-5e62f14ef65c"

const NEW_PERMISSION_DESCRIPTIONS = [
  "Chat",
  "Notification",
  "Email Reminders",
  "Create Invoice From Project in Invoice All",
  "Contracts",
  "Project Details - Tab Tasks",
  "Project Details - Tab Schedule",
  "Time Cards - Projects",
  "Time Cards - Payroll",
  "Time Cards - Requests"
] as const;

const PERMISSION_GROUP_NAMES = [
  "Sub-Contractor Silver",
  "Sub-Contractor Bronze",
  "Group Trial",
] as const;

async function main() {
  console.log(" Iniciando backfill: novas permissões → Permissions, GroupPermissionsList e UserPermission por office.\n");
  if (TEST_COMPANY_ID) {
    console.log(` [MODO TESTE] Apenas company_id: ${TEST_COMPANY_ID}\n`);
  } else {
    console.log(" [MODO COMPLETO] Todas as empresas.\n");
  }

  // ========== ETAPA 1: Criar registros em Permissions (se não existirem) ==========
  console.log(" ETAPA 1 — Permissions");
  const createdPermissionIds: string[] = [];
  const existingPermissionIds: string[] = [];

  for (const description of NEW_PERMISSION_DESCRIPTIONS) {
    const existing = await prisma.permissions.findFirst({
      where: { description },
      select: { id: true },
    });
    if (existing) {
      existingPermissionIds.push(existing.id);
      console.log(`  • "${description}" já existe (id: ${existing.id}) — pulando.`);
    } else {
      const created = await prisma.permissions.create({
        data: { description },
      });
      createdPermissionIds.push(created.id);
      console.log(`  • "${description}" criada (id: ${created.id}).`);
    }
  }

  const allNewPermissionIds = [...new Set([...createdPermissionIds, ...existingPermissionIds])];
  console.log(`  Total de IDs das novas permissões a usar nas etapas 2 e 3: ${allNewPermissionIds.length}\n`);

  if (allNewPermissionIds.length === 0) {
    console.log(" Nenhuma permissão encontrada ou criada. Encerrando.");
    return;
  }

  // ========== ETAPA 2: Incluir novas permissões nos 3 grupos (GroupPermissionsList) ==========
  console.log(" ETAPA 2 — GroupPermissionsList (grupos Sub-Contractor Silver, Sub-Contractor Bronze, Group Trial)");

  for (const groupName of PERMISSION_GROUP_NAMES) {
    const group = await prisma.permissionGroup.findFirst({
      where: { description: groupName },
      include: { GroupPermissionsList: { select: { permission_id: true } } },
    });
    if (!group) {
      console.log(`  • Grupo "${groupName}" não encontrado — pulando.`);
      continue;
    }
    const existingInGroup = new Set(group.GroupPermissionsList.map((g) => g.permission_id));
    let added = 0;
    for (const permissionId of allNewPermissionIds) {
      if (existingInGroup.has(permissionId)) continue;
      await prisma.groupPermissionsList.create({
        data: { permission_group: group.id, permission_id: permissionId },
      });
      existingInGroup.add(permissionId);
      added++;
    }
    console.log(`  • "${groupName}" (id: ${group.id}): ${added} nova(s) permissão(ões) adicionada(s).`);
  }

  // ========== ETAPA 3: Por company → offices (exceto Worker) → UserPermission ==========
  console.log("\n ETAPA 3 — UserPermission por office (exceto office Worker)");

  const companiesFilter = TEST_COMPANY_ID ? { id: TEST_COMPANY_ID } : {};
  const companies = await prisma.company.findMany({
    where: companiesFilter,
    select: { id: true, name: true },
  });

  console.log(`  Empresas a processar: ${companies.length}`);

  let totalOfficesProcessed = 0;
  let totalUserPermissionsCreated = 0;

  for (const company of companies) {
    const offices = await prisma.office.findMany({
      where: {
        company_id: company.id,
        name: { not: "Worker" },
      },
      include: {
        userPermissions: { select: { permission_id: true } },
      },
    });

    for (const office of offices) {
      const existingPermIds = new Set(office.userPermissions.map((u) => u.permission_id));
      const toCreate = allNewPermissionIds.filter((id) => !existingPermIds.has(id));
      if (toCreate.length === 0) {
        continue;
      }
      await prisma.userPermission.createMany({
        data: toCreate.map((permission_id) => ({
          office_id: office.id,
          permission_id,
          editAll: false,
        })),
      });
      totalOfficesProcessed++;
      totalUserPermissionsCreated += toCreate.length;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log(" RESUMO:");
  console.log(`  Permissões criadas na Etapa 1: ${createdPermissionIds.length}`);
  console.log(`  Permissões já existentes usadas: ${existingPermissionIds.length}`);
  console.log(`  Empresas processadas: ${companies.length}`);
  console.log(`  Offices atualizados (exceto Worker): ${totalOfficesProcessed}`);
  console.log(`  Registros UserPermission criados: ${totalUserPermissionsCreated}`);
  console.log("=".repeat(60));
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
