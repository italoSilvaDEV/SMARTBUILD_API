import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { projectIdIn } from "../projectScope";
import { HelpReport, HelpSkill, HelpTool } from "../types";

/**
 * Consultas de leitura de Contracts, Services (catálogo de preços), Users e
 * Job Schedule. Sempre filtradas pela empresa ativa; sem campos sensíveis
 * (assinaturas, tokens públicos, códigos de autenticação).
 */

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const dateOnly = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
const clampLimit = (value: unknown, fallback = 20, max = 100) => Math.min(Math.max(Number(value) || fallback, 1), max);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "");
const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

type Cell = string | number | boolean | null;
function tableReport(title: string, description: string | undefined, columns: [string, string][], rows: Record<string, Cell>[]): HelpReport | null {
  if (!rows.length) return null;
  return { title, description, table: { columns: columns.map(([key, label]) => ({ key, label })), rows } };
}

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

const CONTRACT_STATUSES = ["draft", "sent", "viewed", "signed", "canceled", "expired"] as const;

const contracts: HelpTool = {
  name: "contracts",
  description:
    "Contratos da empresa: contagem por status e lista com número, cliente, status, datas de envio, visualização e assinatura. Filtros: status (draft, sent, viewed, signed, canceled, expired) e search (nome do cliente).",
  readOnly: true,
  requiredPermissions: ["Contracts"],
  parameters: {
    type: "object",
    properties: {
      status: { type: "array", items: { type: "string", enum: [...CONTRACT_STATUSES] } },
      search: { type: "string", description: "Nome do cliente" },
      limit: { type: "number", description: "Padrão 20, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const statuses = list(args.status).filter((s): s is (typeof CONTRACT_STATUSES)[number] => (CONTRACT_STATUSES as readonly string[]).includes(s));
    const search = text(args.search);
    const where: Prisma.ContractWhereInput = {
      companyId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(search ? { client: { name: { contains: search } } } : {}),
    };
    const [byStatus, total, rows] = await Promise.all([
      prisma.contract.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
      prisma.contract.count({ where }),
      prisma.contract.findMany({
        where,
        take: clampLimit(args.limit),
        orderBy: { date_creation: "desc" },
        select: {
          number: true,
          status: true,
          sentAt: true,
          viewedAt: true,
          signedAt: true,
          expiresAt: true,
          date_creation: true,
          client: { select: { name: true } },
        },
      }),
    ]);
    return {
      totalMatching: total,
      byStatus: Object.fromEntries(byStatus.map((group) => [group.status, group._count._all])),
      items: rows.map((row) => ({
        number: row.number,
        client: row.client?.name ?? null,
        status: row.status,
        createdAt: dateOnly(row.date_creation),
        sentAt: dateOnly(row.sentAt),
        viewedAt: dateOnly(row.viewedAt),
        signedAt: dateOnly(row.signedAt),
        expiresAt: dateOnly(row.expiresAt),
      })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Contracts",
      `${output?.totalMatching ?? 0} contracts`,
      [["number", "#"], ["client", "Client"], ["status", "Status"], ["sentAt", "Sent"], ["viewedAt", "Viewed"], ["signedAt", "Signed"], ["expiresAt", "Expires"]],
      (output?.items ?? []).map((i: any) => ({ number: i.number, client: i.client, status: i.status, sentAt: i.sentAt, viewedAt: i.viewedAt, signedAt: i.signedAt, expiresAt: i.expiresAt }))
    ),
};

export const contractsSkill: HelpSkill = {
  id: "contracts-data",
  description: "Consulta os contratos da empresa.",
  instructions: `
Para perguntas sobre contratos (quantos, aguardando assinatura, assinados, de um cliente), use contracts. "sent" = enviado e ainda não assinado; "viewed" = cliente abriu o link; "signed" = assinado.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [contracts],
};

/* ------------------------------------------------------------------ */
/* Services (catálogo de preços)                                       */
/* ------------------------------------------------------------------ */

const servicesCatalog: HelpTool = {
  name: "services_catalog",
  description:
    "Catálogo de serviços da empresa (Management > Services): nome, categoria/subcategoria, tipo de preço e valores (fixo, mínimo, máximo). Filtro search no nome do serviço.",
  readOnly: true,
  requiredPermissions: ["Services"],
  parameters: {
    type: "object",
    properties: {
      search: { type: "string" },
      limit: { type: "number", description: "Padrão 30, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const search = text(args.search);
    const where: Prisma.ServiceWhereInput = { company_id: companyId, ...(search ? { service_name: { contains: search } } : {}) };
    const [total, rows] = await Promise.all([
      prisma.service.count({ where }),
      prisma.service.findMany({
        where,
        take: clampLimit(args.limit, 30),
        orderBy: { service_name: "asc" },
        select: {
          service_name: true,
          price_type: true,
          type_variable: true,
          price_fixe: true,
          price_minimum: true,
          price_maximum: true,
          description: true,
          service: { select: { subcategory_name: true, subcategory: { select: { category_name: true } } } },
        },
      }),
    ]);
    const price = (value: unknown) => (value === null || value === undefined ? null : usd(Number(value)));
    return {
      totalMatching: total,
      items: rows.map((row) => ({
        name: row.service_name,
        category: (row.service as any)?.subcategory?.category_name ?? null,
        subcategory: row.service?.subcategory_name ?? null,
        priceType: row.price_type,
        unit: row.type_variable,
        fixedUsd: price(row.price_fixe),
        minimumUsd: price(row.price_minimum),
        maximumUsd: price(row.price_maximum),
        description: row.description,
      })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Services",
      `${output?.totalMatching ?? 0} services`,
      [["name", "Service"], ["category", "Category"], ["subcategory", "Subcategory"], ["priceType", "Price type"], ["fixedUsd", "Fixed"], ["minimumUsd", "Min"], ["maximumUsd", "Max"]],
      (output?.items ?? []).map((i: any) => ({ name: i.name, category: i.category, subcategory: i.subcategory, priceType: i.priceType, fixedUsd: i.fixedUsd, minimumUsd: i.minimumUsd, maximumUsd: i.maximumUsd }))
    ),
};

export const servicesCatalogSkill: HelpSkill = {
  id: "services-data",
  description: "Consulta o catálogo de serviços e preços da empresa.",
  instructions: `
Para perguntas sobre o catálogo de serviços (quais serviços existem, preço de um serviço), use services_catalog. Preço fixo, mínimo e máximo dependem do tipo de preço do serviço.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [servicesCatalog],
};

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

const users: HelpTool = {
  name: "company_users",
  description:
    "Equipe da empresa (User Management): nome, cargo, e-mail, telefone e se está desativado. Filtros: search (nome ou e-mail), office (cargo) e includeDisabled.",
  readOnly: true,
  requiredPermissions: ["User Management"],
  parameters: {
    type: "object",
    properties: {
      search: { type: "string" },
      office: { type: "string", description: "Nome do cargo, ex.: Worker" },
      includeDisabled: { type: "boolean" },
      limit: { type: "number", description: "Padrão 30, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const search = text(args.search);
    const office = text(args.office);
    const where: Prisma.UserWhereInput = {
      company_id: companyId,
      ...(args.includeDisabled === true ? {} : { NOT: { isDisabled: true } }),
      ...(office ? { office: { name: { contains: office } } } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
    };
    const [byOffice, total, rows] = await Promise.all([
      prisma.user.groupBy({ by: ["office_id"], where: { company_id: companyId, NOT: { isDisabled: true } }, _count: { _all: true } }),
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        take: clampLimit(args.limit, 30),
        orderBy: { name: "asc" },
        select: { name: true, email: true, phone: true, isDisabled: true, office: { select: { name: true } } },
      }),
    ]);
    const offices = await prisma.office.findMany({ where: { id: { in: byOffice.map((group) => group.office_id) } }, select: { id: true, name: true } });
    const officeName = new Map(offices.map((item) => [item.id, item.name]));
    return {
      totalMatching: total,
      activeByOffice: Object.fromEntries(byOffice.map((group) => [officeName.get(group.office_id) ?? group.office_id, group._count._all])),
      items: rows.map((row) => ({ name: row.name, office: row.office?.name ?? null, email: row.email, phone: row.phone, disabled: Boolean(row.isDisabled) })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Team",
      `${output?.totalMatching ?? 0} users`,
      [["name", "Name"], ["office", "Role"], ["email", "Email"], ["phone", "Phone"], ["disabled", "Disabled"]],
      (output?.items ?? []).map((i: any) => ({ name: i.name, office: i.office, email: i.email, phone: i.phone, disabled: i.disabled ? "Yes" : "No" }))
    ),
};

export const usersSkill: HelpSkill = {
  id: "users-data",
  description: "Consulta a equipe da empresa e seus cargos.",
  instructions: `
Para perguntas sobre a equipe (quantos usuários, quem é de um cargo, e-mail de alguém), use company_users. Não exponha senhas nem tokens; a ferramenta não os retorna.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [users],
};

/* ------------------------------------------------------------------ */
/* Job Schedule                                                        */
/* ------------------------------------------------------------------ */

const jobSchedule: HelpTool = {
  name: "job_schedule",
  description:
    "Agenda de trabalhos (Job Schedule/Dispatch): serviços de projetos com data de início e prazo, status e projeto. Filtros: from e to (YYYY-MM-DD, sobre a data de início ou do prazo), status e search (projeto ou serviço).",
  readOnly: true,
  requiredPermissions: ["Job Schedule"],
  requiresFullProjectAccess: true,
  projectScoped: true,
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD" },
      to: { type: "string", description: "YYYY-MM-DD" },
      status: { type: "string" },
      search: { type: "string" },
      limit: { type: "number", description: "Padrão 30, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const search = text(args.search);
    const status = text(args.status);
    const from = text(args.from);
    const to = text(args.to);
    const rows = await prisma.serviceProject.findMany({
      where: {
        company_id: companyId,
        ...(projectIdIn(ctx) ? { projectId: projectIdIn(ctx) } : {}),
        OR: [{ start_date: { not: null } }, { deadline: { not: null } }],
        ...(status ? { status: { contains: status } } : {}),
        ...(search ? { AND: [{ OR: [{ name: { contains: search } }, { Project: { location: { contains: search } } }] }] } : {}),
      },
      take: 600,
      orderBy: { date_creation: "desc" },
      select: { name: true, status: true, start_date: true, deadline: true, scheduleCompleted: true, Project: { select: { id: true, location: true, status_project: true } } },
    });
    const inRange = (value: string | null) => {
      const day = value ? value.slice(0, 10) : "";
      if (!day) return false;
      return (!from || day >= from) && (!to || day <= to);
    };
    const filtered = (from || to ? rows.filter((row) => inRange(row.start_date) || inRange(row.deadline)) : rows)
      .sort((a, b) => String(a.start_date ?? a.deadline ?? "").localeCompare(String(b.start_date ?? b.deadline ?? "")))
      .slice(0, clampLimit(args.limit, 30));
    return {
      totalMatching: filtered.length,
      note: "Datas de início e prazo conforme cadastradas nos serviços do projeto.",
      items: filtered.map((row) => ({
        projectId: row.Project?.id ?? null,
        service: row.name,
        project: row.Project?.location ?? null,
        projectStatus: row.Project?.status_project ?? null,
        status: row.status,
        startDate: row.start_date ? row.start_date.slice(0, 10) : null,
        deadline: row.deadline ? row.deadline.slice(0, 10) : null,
        completed: Boolean(row.scheduleCompleted),
      })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Job Schedule",
      `${output?.totalMatching ?? 0} scheduled services`,
      [["startDate", "Start"], ["deadline", "Deadline"], ["service", "Service"], ["project", "Project"], ["status", "Status"], ["completed", "Done"]],
      (output?.items ?? []).map((i: any) => ({ startDate: i.startDate, deadline: i.deadline, service: i.service, project: i.project, status: i.status, completed: i.completed ? "Yes" : "No" }))
    ),
};

export const jobScheduleSkill: HelpSkill = {
  id: "job-schedule-data",
  description: "Consulta a agenda de trabalhos (serviços com data de início e prazo).",
  instructions: `
Para perguntas sobre agenda (o que está agendado esta semana, prazos que vencem, serviços de um projeto), use job_schedule com from/to resolvidos a partir da data de hoje.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [jobSchedule],
};
