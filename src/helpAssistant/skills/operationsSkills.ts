import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { canSeeProject, projectIdIn } from "../projectScope";
import { HelpReport, HelpSkill, HelpTool } from "../types";
import { jobScheduleSkill } from "./moreModuleSkills";

/**
 * Consultas de leitura de operação: quem está trabalhando agora (Activities),
 * pedidos de edição de time card, catálogo, configurações da empresa e Job Dispatch.
 * Sem assinaturas, tokens, chaves nem coordenadas de GPS.
 */

const clampLimit = (value: unknown, fallback = 30, max = 100) => Math.min(Math.max(Number(value) || fallback, 1), max);
const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : "");
const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

type Cell = string | number | boolean | null;
function tableReport(title: string, description: string | undefined, columns: [string, string][], rows: Record<string, Cell>[]): HelpReport | null {
  if (!rows.length) return null;
  return { title, description, table: { columns: columns.map(([key, label]) => ({ key, label })), rows } };
}

/* ------------------------------------------------------------------ */
/* Quem está trabalhando agora (Activities)                            */
/* ------------------------------------------------------------------ */

const STALE_HOURS = 16;

const whoIsWorkingNow: HelpTool = {
  name: "who_is_working_now",
  description:
    "Quem da equipe está trabalhando AGORA (registro de ponto aberto: entrada sem saída), desde que horas, há quantas horas e em qual projeto/serviço, mais quem já encerrou nas últimas 24 horas. Use para 'tem alguém trabalhando agora?'.",
  readOnly: true,
  requiredPermissions: ["Activities"],
  parameters: { type: "object", properties: { search: { type: "string", description: "Nome do funcionário" } } },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const search = text(args.search);
    const now = new Date();
    const since = new Date(now.getTime() - 24 * 3600 * 1000);
    const userFilter = search ? { user: { name: { contains: search } } } : {};

    const select = {
      check_in_time: true,
      check_out_time: true,
      pending_project_name: true,
      pending_project_address: true,
      user: { select: { name: true, office: { select: { name: true } } } },
      UserServiceProject: {
        select: { service_project: { select: { name: true, Project: { select: { id: true, location: true } } } } },
      },
    } satisfies Prisma.UserAttendanceSelect;

    const [open, closed] = await Promise.all([
      prisma.userAttendance.findMany({
        where: { company_id: companyId, check_out_time: null, ...userFilter },
        orderBy: { check_in_time: "desc" },
        take: 200,
        select,
      }),
      prisma.userAttendance.findMany({
        where: { company_id: companyId, check_out_time: { gte: since }, ...userFilter },
        orderBy: { check_out_time: "desc" },
        take: 200,
        select,
      }),
    ]);

    const describe = (row: (typeof open)[number]) => {
      const service = row.UserServiceProject?.service_project;
      const project = service?.Project;
      const visible = project ? canSeeProject(ctx, project.id) : true;
      return {
        worker: row.user.name,
        office: row.user.office?.name ?? null,
        service: service?.name ?? null,
        project: project ? (visible ? project.location : "(projeto fora do seu acesso)") : row.pending_project_address ?? row.pending_project_name ?? null,
        checkIn: iso(row.check_in_time),
        checkOut: iso(row.check_out_time),
        hoursOpen: row.check_out_time ? null : Math.round(((now.getTime() - row.check_in_time.getTime()) / 3600000) * 10) / 10,
      };
    };

    const working = open.map(describe);
    const likelyForgotten = working.filter((row) => (row.hoursOpen ?? 0) > STALE_HOURS);
    return {
      now: now.toISOString(),
      workingNowCount: working.length - likelyForgotten.length,
      note: `Registro aberto há mais de ${STALE_HOURS}h provavelmente é saída esquecida; aparece em possiblyForgottenCheckout, não em workingNow. Horários em UTC.`,
      workingNow: working.filter((row) => (row.hoursOpen ?? 0) <= STALE_HOURS),
      possiblyForgottenCheckout: likelyForgotten,
      finishedLast24h: closed.map(describe),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Working now",
      `${output?.workingNowCount ?? 0} working now`,
      [["worker", "Worker"], ["office", "Role"], ["project", "Project"], ["service", "Service"], ["checkIn", "Check-in (UTC)"], ["hoursOpen", "Hours"]],
      (output?.workingNow ?? []).map((i: any) => ({ worker: i.worker, office: i.office, project: i.project, service: i.service, checkIn: i.checkIn, hoursOpen: i.hoursOpen }))
    ),
};

export const activitiesSkill: HelpSkill = {
  id: "activities-data",
  description: "Quem está trabalhando agora e quem já encerrou.",
  instructions: `
Para "tem alguém trabalhando agora?", "quem está em campo?", "quem já saiu?", use who_is_working_now. Responda com os nomes e projetos; os horários vêm em UTC, então converta para o fuso do usuário só se ele o disser, senão informe "há X horas". Registros abertos há mais de 16h são tratados como saída esquecida: avise isso em uma frase.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [whoIsWorkingNow],
};


const subcontractorDirectory: HelpTool = {
  name: "subcontractor_directory",
  description:
    "Cadastro de TODOS os subcontractors da empresa (nome, e-mail, telefone, endereço), sem custos: use para 'quais subcontractors eu tenho', 'contato do subcontractor X'. Retorna o total real e todos os nomes (até 200).",
  readOnly: true,
  requiredPermissions: ["Subcontractors"],
  parameters: { type: "object", properties: { search: { type: "string", description: "Parte do nome ou e-mail" } } },
  async run(args, ctx) {
    const search = text(args.search);
    const where: Prisma.SubcontractorWhereInput = {
      company_id: ctx.companyId!,
      ...(search ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.subcontractor.count({ where }),
      prisma.subcontractor.findMany({ where, take: 200, orderBy: { name: "asc" }, select: { name: true, email: true, phone: true, address: true } }),
    ]);
    return { totalSubcontractors: total, listed: rows.length, items: rows };
  },
  buildReport: (_args, output) =>
    tableReport("Subcontractors", `${output?.totalSubcontractors ?? 0} subcontractors`, [["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["address", "Address"]], (output?.items ?? []) as Record<string, Cell>[]),
};

export const subcontractorDirectorySkill: HelpSkill = {
  id: "subcontractor-directory-data",
  description: "Cadastro completo de subcontractors.",
  instructions: `
Para "quais subcontractors eu tenho" ou "liste os subcontractors", use subcontractor_directory e liste TODOS os nomes retornados (não resuma em "alguns"). Para custos e projetos de subcontractors use as outras ferramentas.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [subcontractorDirectory],
};

/* ------------------------------------------------------------------ */
/* Lançamentos recentes de subcontractors                              */
/* ------------------------------------------------------------------ */

const recentSubcontractorEntries: HelpTool = {
  name: "recent_subcontractor_entries",
  description:
    "Lançamentos de serviço/custo de subcontractors em ORDEM DE DATA (mais recentes primeiro), de todos os subcontractors e projetos de uma vez. Use para 'qual foi o último subcontratado que fez serviço', 'últimos pagamentos a subcontractors'. sortBy: payment (data de pagamento, padrão) ou created (data em que foi lançado). A data do serviço não serve para ordenar: no cadastro ela é texto livre em formatos misturados.",
  readOnly: true,
  requiredPermissions: ["Subcontractors"],
  requiresFullProjectAccess: true,
  projectScoped: true,
  parameters: {
    type: "object",
    properties: {
      sortBy: { type: "string", enum: ["payment", "created"] },
      subcontractorName: { type: "string" },
      limit: { type: "number", description: "Padrão 10, máx. 50" },
    },
  },
  async run(args, ctx) {
    const sortBy = args.sortBy === "created" ? "created" : "payment";
    const name = text(args.subcontractorName);
    const limit = clampLimit(args.limit, 10, 50);
    const rows = await prisma.workedhours.findMany({
      where: {
        subcontractor_id: { not: null },
        project: { is: { company_id: ctx.companyId!, ...(projectIdIn(ctx) ? { id: projectIdIn(ctx) } : {}) } },
        ...(name ? { subcontractor: { is: { name: { contains: name } } } } : {}),
      },
      orderBy: sortBy === "created" ? [{ date_creation: "desc" }] : [{ payment_date: "desc" }, { date_creation: "desc" }],
      take: limit,
      select: {
        start_date: true,
        end_date: true,
        payment_date: true,
        date_creation: true,
        description: true,
        type_price: true,
        amount_of_hours: true,
        hourly_price: true,
        fixed_price: true,
        subcontractor: { select: { name: true } },
        project: { select: { id: true, location: true, client: { select: { name: true } } } },
      },
    });
    const amount = (row: (typeof rows)[number]) =>
      row.type_price === "fixed" ? Number(row.fixed_price ?? 0) : Number(row.amount_of_hours ?? 0) * Number(row.hourly_price ?? 0);
    const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
    return {
      sortedBy: sortBy,
      note: "A data do serviço (serviceStart/serviceEnd) é texto livre no cadastro e pode estar inválida ou em formatos diferentes: cite-a só como informação. A ordem é pela data de pagamento ou de lançamento; diga ao usuário qual foi usada.",
      items: rows.map((row) => ({
        subcontractor: row.subcontractor?.name ?? null,
        project: row.project?.location ?? null,
        client: row.project?.client?.name ?? null,
        serviceStart: row.start_date,
        serviceEnd: row.end_date,
        paymentDate: row.payment_date ? row.payment_date.toISOString().slice(0, 10) : null,
        loggedAt: row.date_creation.toISOString().slice(0, 10),
        description: row.description,
        amountUsd: usd(amount(row)),
      })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Recent Subcontractor Entries",
      `sorted by ${output?.sortedBy}`,
      [["subcontractor", "Subcontractor"], ["project", "Project"], ["serviceStart", "Service"], ["paymentDate", "Paid"], ["loggedAt", "Logged"], ["amountUsd", "Amount"]],
      (output?.items ?? []).map((i: any) => ({ subcontractor: i.subcontractor, project: i.project, serviceStart: i.serviceStart, paymentDate: i.paymentDate, loggedAt: i.loggedAt, amountUsd: i.amountUsd }))
    ),
};

export const recentSubcontractorSkill: HelpSkill = {
  id: "recent-subcontractors-data",
  description: "Últimos lançamentos de subcontractors, em ordem de data.",
  instructions: `
Para "último/mais recente subcontratado que trabalhou/foi pago" use recent_subcontractor_entries uma vez (padrão: ordem por data de pagamento) e diga por qual data ordenou. Não varra subcontractor por subcontractor.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [recentSubcontractorEntries],
};

/* ------------------------------------------------------------------ */
/* Pedidos de edição de time card                                      */
/* ------------------------------------------------------------------ */

const EDIT_STATUSES = ["pending", "approved", "denied"] as const;

const timeCardEditRequests: HelpTool = {
  name: "time_card_edit_requests",
  description:
    "Pedidos de correção ou ponto esquecido dos funcionários (Time Cards): contagem por status e lista com funcionário, tipo, horários solicitados, motivo e situação. Filtros: status (pending, approved, denied) e employeeName.",
  readOnly: true,
  requiredPermissions: ["Time Cards"],
  parameters: {
    type: "object",
    properties: {
      status: { type: "array", items: { type: "string", enum: [...EDIT_STATUSES] } },
      employeeName: { type: "string" },
      limit: { type: "number", description: "Padrão 30, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const statuses = list(args.status).filter((s): s is (typeof EDIT_STATUSES)[number] => (EDIT_STATUSES as readonly string[]).includes(s));
    const employeeName = text(args.employeeName);
    const where: Prisma.TimeCardEditRequestWhereInput = {
      companyId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(employeeName ? { employee: { name: { contains: employeeName } } } : {}),
    };
    const [byStatus, total, rows] = await Promise.all([
      prisma.timeCardEditRequest.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
      prisma.timeCardEditRequest.count({ where }),
      prisma.timeCardEditRequest.findMany({
        where,
        take: clampLimit(args.limit),
        orderBy: { createdAt: "desc" },
        select: {
          requestType: true,
          status: true,
          reason: true,
          managerNote: true,
          requestedCheckInTime: true,
          requestedCheckOutTime: true,
          originalCheckInTime: true,
          originalCheckOutTime: true,
          reviewedAt: true,
          createdAt: true,
          employee: { select: { name: true } },
          reviewer: { select: { name: true } },
        },
      }),
    ]);
    return {
      totalMatching: total,
      byStatus: Object.fromEntries(byStatus.map((group) => [group.status, group._count._all])),
      note: "Horários em UTC.",
      items: rows.map((row) => ({
        employee: row.employee.name,
        type: row.requestType,
        status: row.status,
        reason: row.reason,
        originalCheckIn: iso(row.originalCheckInTime),
        originalCheckOut: iso(row.originalCheckOutTime),
        requestedCheckIn: iso(row.requestedCheckInTime),
        requestedCheckOut: iso(row.requestedCheckOutTime),
        reviewedBy: row.reviewer?.name ?? null,
        managerNote: row.managerNote,
        createdAt: iso(row.createdAt),
      })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Time Card Edit Requests",
      `${output?.totalMatching ?? 0} requests`,
      [["employee", "Employee"], ["type", "Type"], ["status", "Status"], ["requestedCheckIn", "Requested in"], ["requestedCheckOut", "Requested out"], ["reason", "Reason"]],
      (output?.items ?? []).map((i: any) => ({ employee: i.employee, type: i.type, status: i.status, requestedCheckIn: i.requestedCheckIn, requestedCheckOut: i.requestedCheckOut, reason: i.reason }))
    ),
};

export const timeCardRequestsSkill: HelpSkill = {
  id: "timecard-requests-data",
  description: "Consulta pedidos de correção de ponto.",
  instructions: `
Para perguntas sobre pedidos de correção/ponto esquecido (quantos pendentes, de quem, motivo), use time_card_edit_requests. O assistente só consulta; aprovar ou negar é feito pelo próprio usuário na tela Time Cards.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [timeCardEditRequests],
};

/* ------------------------------------------------------------------ */
/* Catálogo e configurações                                            */
/* ------------------------------------------------------------------ */

const catalogItems: HelpTool = {
  name: "catalog_items",
  description: "Itens do catálogo da empresa (Management > Catalog): nome, quantidade de imagens e data de criação. Filtro search no nome.",
  readOnly: true,
  requiredPermissions: ["Catalog"],
  parameters: { type: "object", properties: { search: { type: "string" }, limit: { type: "number", description: "Padrão 30, máx. 100" } } },
  async run(args, ctx) {
    const search = text(args.search);
    const where: Prisma.CatalogWhereInput = { company_id: ctx.companyId!, ...(search ? { catalog_name: { contains: search } } : {}) };
    const [total, rows] = await Promise.all([
      prisma.catalog.count({ where }),
      prisma.catalog.findMany({
        where,
        take: clampLimit(args.limit),
        orderBy: { date_creation: "desc" },
        select: { catalog_name: true, date_creation: true, _count: { select: { imgCatalog: true } } },
      }),
    ]);
    return {
      totalMatching: total,
      items: rows.map((row) => ({ name: row.catalog_name, images: row._count.imgCatalog, createdAt: iso(row.date_creation)?.slice(0, 10) ?? null })),
    };
  },
  buildReport: (_args, output) =>
    tableReport("Catalog", `${output?.totalMatching ?? 0} items`, [["name", "Name"], ["images", "Images"], ["createdAt", "Created"]], (output?.items ?? []) as Record<string, Cell>[]),
};

const companySettings: HelpTool = {
  name: "company_settings",
  description:
    "Configurações da empresa (Settings): nome, plano e quais integrações do QuickBooks estão ativas. Não retorna chaves, tokens nem dados de pagamento.",
  readOnly: true,
  requiredPermissions: ["Settings"],
  parameters: { type: "object", properties: {} },
  async run(_args, ctx) {
    const companyId = ctx.companyId!;
    const [company, quickbooks, defaultPolicy] = await Promise.all([
      prisma.company.findUnique({ where: { id: companyId }, select: { name: true, Plan: { select: { name: true } } } } as any),
      prisma.quickBooksConfig.findMany({ where: { companyId }, select: { configType: true, isActive: true } }),
      prisma.breakPolicy.findFirst({ where: { companyId, isDefault: true, isActive: true }, select: { name: true } }),
    ]);
    const plan = (company as any)?.Plan?.name ?? null;
    return {
      company: (company as any)?.name ?? null,
      plan,
      quickbooks: quickbooks.map((item) => ({ type: item.configType, active: item.isActive })),
      defaultBreakPolicy: defaultPolicy?.name ?? null,
    };
  },
};

export const catalogAndSettingsSkill: HelpSkill = {
  id: "catalog-settings-data",
  description: "Catálogo e configurações da empresa (somente leitura).",
  instructions: `
Para o catálogo use catalog_items; para perguntas sobre plano, integrações ativas (QuickBooks) e política de intervalo padrão use company_settings. Nunca peça nem mostre chaves ou tokens.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [catalogItems, companySettings],
};

/* ------------------------------------------------------------------ */
/* Job Dispatch (mesma agenda, permissão própria)                      */
/* ------------------------------------------------------------------ */

const schedule = jobScheduleSkill.tools![0];

export const jobDispatchSkill: HelpSkill = {
  id: "job-dispatch-data",
  description: "Consulta os serviços agendados para despacho.",
  instructions: `
Para perguntas sobre o despacho do dia/semana (serviços com início ou prazo em um período), use job_dispatch com from/to resolvidos a partir da data de hoje.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [{ ...schedule, name: "job_dispatch", description: schedule.description.replace("Agenda de trabalhos (Job Schedule/Dispatch)", "Despacho de trabalhos (Job Dispatch)"), requiredPermissions: ["Job Dispatch"] }],
};
