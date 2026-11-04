import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { HelpReport, HelpSkill, HelpTool } from "../types";

/**
 * Consultas de leitura dos módulos Break Policies, Work Orders, Bid Requests
 * e Accounts Payable. Sempre filtradas pela empresa ativa do usuário.
 */

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const money = (value: unknown) => Number(value ?? 0);
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
/* Break Policies                                                      */
/* ------------------------------------------------------------------ */

const breakPolicies: HelpTool = {
  name: "break_policies",
  description:
    "Políticas de intervalo (break) da empresa: nome, regras, dias da semana, se é padrão/ativa e quantos funcionários usam cada uma. Com userName, mostra a política atribuída a esse funcionário.",
  readOnly: true,
  requiredPermissions: ["Settings"],
  parameters: {
    type: "object",
    properties: {
      userName: { type: "string", description: "Parte do nome do funcionário" },
      onlyActive: { type: "boolean" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const userName = text(args.userName);
    const [policies, assignments] = await Promise.all([
      prisma.breakPolicy.findMany({
        where: { companyId, ...(args.onlyActive === true ? { isActive: true } : {}) },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true, rules: true, weekdays: true, isDefault: true, isActive: true, _count: { select: { assignments: true } } },
      }),
      prisma.userBreakPolicyAssignment.findMany({
        where: { companyId, ...(userName ? { user: { name: { contains: userName } } } : {}) },
        take: userName ? 25 : 0,
        select: { mode: true, user: { select: { name: true } }, policy: { select: { name: true } } },
      }),
    ]);
    return {
      note: "weekdays: 0=domingo ... 6=sábado. mode: company = usa a política padrão da empresa; specific = política própria; legacy = regra antiga.",
      total: policies.length,
      policies: policies.map((policy) => ({
        name: policy.name,
        isDefault: policy.isDefault,
        isActive: policy.isActive,
        weekdays: policy.weekdays,
        rules: policy.rules,
        assignedUsers: policy._count.assignments,
      })),
      ...(userName
        ? { userAssignments: assignments.map((item) => ({ user: item.user.name, mode: item.mode, policy: item.policy?.name ?? null })) }
        : {}),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Break Policies",
      `${output?.total ?? 0} policies`,
      [["name", "Policy"], ["isDefault", "Default"], ["isActive", "Active"], ["assignedUsers", "Users"]],
      (output?.policies ?? []).map((p: any) => ({ name: p.name, isDefault: p.isDefault ? "Yes" : "No", isActive: p.isActive ? "Yes" : "No", assignedUsers: p.assignedUsers }))
    ),
};

export const breakPoliciesSkill: HelpSkill = {
  id: "break-policies-data",
  description: "Consulta as políticas de intervalo (break) da empresa.",
  instructions: `
Para perguntas sobre políticas de intervalo/break da empresa (quais existem, regras, quem usa qual), use break_policies. As regras vêm em "rules" como estão cadastradas; explique-as em linguagem simples, sem inventar campos. Para o intervalo de um funcionário, passe userName.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [breakPolicies],
};

/* ------------------------------------------------------------------ */
/* Work Orders                                                         */
/* ------------------------------------------------------------------ */

const WORK_ORDER_STATUSES = ["pending", "approved", "canceled"] as const;

const workOrders: HelpTool = {
  name: "work_orders",
  description:
    "Ordens de serviço (Work Orders): contagem por status e lista com número, título, responsável, projeto, datas e valor. Filtros: status (pending, approved, canceled) e search (título, projeto, endereço ou responsável).",
  readOnly: true,
  requiredPermissions: ["Projects"],
  requiresFullProjectAccess: true,
  parameters: {
    type: "object",
    properties: {
      status: { type: "array", items: { type: "string", enum: [...WORK_ORDER_STATUSES] } },
      search: { type: "string" },
      limit: { type: "number", description: "Padrão 20, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const statuses = list(args.status).filter((s): s is (typeof WORK_ORDER_STATUSES)[number] => (WORK_ORDER_STATUSES as readonly string[]).includes(s));
    const search = text(args.search);
    const where: Prisma.WorkOrderWhereInput = {
      companyId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(search
        ? { OR: [{ title: { contains: search } }, { projectName: { contains: search } }, { projectAddress: { contains: search } }, { assigneeName: { contains: search } }] }
        : {}),
    };
    const [byStatus, total, rows] = await Promise.all([
      prisma.workOrder.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
      prisma.workOrder.count({ where }),
      prisma.workOrder.findMany({
        where,
        take: clampLimit(args.limit),
        orderBy: { createdAt: "desc" },
        select: {
          number: true,
          title: true,
          status: true,
          assigneeName: true,
          assigneeType: true,
          projectId: true,
          projectName: true,
          projectAddress: true,
          startDate: true,
          endDate: true,
          approvedAt: true,
          items: { select: { quantity: true, unitPrice: true } },
        },
      }),
    ]);
    return {
      totalMatching: total,
      byStatus: Object.fromEntries(byStatus.map((group) => [group.status, group._count._all])),
      items: rows.map((row) => ({
        projectId: row.projectId,
        number: row.number,
        title: row.title,
        status: row.status,
        assignee: row.assigneeName,
        assigneeType: row.assigneeType,
        project: row.projectAddress ?? row.projectName,
        startDate: dateOnly(row.startDate),
        endDate: dateOnly(row.endDate),
        approvedAt: dateOnly(row.approvedAt),
        totalUsd: usd(row.items.reduce((acc, item) => acc + money(item.quantity) * money(item.unitPrice), 0)),
      })),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Work Orders",
      `${output?.totalMatching ?? 0} work orders`,
      [["number", "#"], ["title", "Title"], ["status", "Status"], ["assignee", "Assignee"], ["project", "Project"], ["startDate", "Start"], ["endDate", "End"], ["totalUsd", "Total"]],
      (output?.items ?? []).map((i: any) => ({ number: i.number, title: i.title, status: i.status, assignee: i.assignee, project: i.project, startDate: i.startDate, endDate: i.endDate, totalUsd: i.totalUsd }))
    ),
};

export const workOrdersSkill: HelpSkill = {
  id: "work-orders-data",
  description: "Consulta as ordens de serviço da empresa.",
  instructions: `
Para perguntas sobre ordens de serviço (quantas, pendentes, aprovadas, de um responsável ou projeto), use work_orders. Para uma ordem específica, filtre por search e cite o número (#).
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [workOrders],
};

/* ------------------------------------------------------------------ */
/* Bid Requests                                                        */
/* ------------------------------------------------------------------ */

const BID_STATUSES = ["pending", "finalized", "canceled"] as const;

const bidRequests: HelpTool = {
  name: "bid_requests",
  description:
    "Solicitações de proposta (Bid Requests): contagem por status e lista com número, título, projeto, prazo de resposta e situação dos destinatários (subcontractors convidados, respostas, aprovado). Filtros: status (pending, finalized, canceled) e search.",
  readOnly: true,
  requiredPermissions: ["Projects"],
  requiresFullProjectAccess: true,
  parameters: {
    type: "object",
    properties: {
      status: { type: "array", items: { type: "string", enum: [...BID_STATUSES] } },
      search: { type: "string", description: "Título, projeto, endereço ou subcontractor convidado" },
      limit: { type: "number", description: "Padrão 20, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const statuses = list(args.status).filter((s): s is (typeof BID_STATUSES)[number] => (BID_STATUSES as readonly string[]).includes(s));
    const search = text(args.search);
    const where: Prisma.BidRequestWhereInput = {
      companyId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search } },
              { projectName: { contains: search } },
              { projectAddress: { contains: search } },
              { recipients: { some: { subcontractorName: { contains: search } } } },
            ],
          }
        : {}),
    };
    const [byStatus, total, rows] = await Promise.all([
      prisma.bidRequest.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
      prisma.bidRequest.count({ where }),
      prisma.bidRequest.findMany({
        where,
        take: clampLimit(args.limit),
        orderBy: { createdAt: "desc" },
        select: {
          number: true,
          title: true,
          status: true,
          projectId: true,
          projectName: true,
          projectAddress: true,
          responseDeadline: true,
          sentAt: true,
          approvedRecipientId: true,
          recipients: { select: { id: true, status: true, subcontractorName: true } },
        },
      }),
    ]);
    return {
      totalMatching: total,
      byStatus: Object.fromEntries(byStatus.map((group) => [group.status, group._count._all])),
      items: rows.map((row) => {
        const counts: Record<string, number> = {};
        for (const recipient of row.recipients) counts[recipient.status] = (counts[recipient.status] ?? 0) + 1;
        return {
          projectId: row.projectId,
          number: row.number,
          title: row.title,
          status: row.status,
          project: row.projectAddress ?? row.projectName,
          responseDeadline: dateOnly(row.responseDeadline),
          sentAt: dateOnly(row.sentAt),
          invited: row.recipients.length,
          recipientsByStatus: counts,
          approvedSubcontractor: row.recipients.find((recipient) => recipient.id === row.approvedRecipientId)?.subcontractorName ?? null,
          recipients: row.recipients.slice(0, 15).map((recipient) => ({ name: recipient.subcontractorName, status: recipient.status })),
        };
      }),
    };
  },
  buildReport: (_args, output) =>
    tableReport(
      "Bid Requests",
      `${output?.totalMatching ?? 0} bid requests`,
      [["number", "#"], ["title", "Title"], ["status", "Status"], ["project", "Project"], ["responseDeadline", "Deadline"], ["invited", "Invited"], ["submitted", "Submitted"], ["approvedSubcontractor", "Approved"]],
      (output?.items ?? []).map((i: any) => ({
        number: i.number,
        title: i.title,
        status: i.status,
        project: i.project,
        responseDeadline: i.responseDeadline,
        invited: i.invited,
        submitted: (i.recipientsByStatus?.submitted ?? 0) + (i.recipientsByStatus?.approved ?? 0),
        approvedSubcontractor: i.approvedSubcontractor,
      }))
    ),
};

export const bidRequestsSkill: HelpSkill = {
  id: "bid-requests-data",
  description: "Consulta as solicitações de proposta (bid requests).",
  instructions: `
Para perguntas sobre bid requests (abertas, finalizadas, quem respondeu, quem foi aprovado, prazo), use bid_requests. "Submitted" = proposta enviada pelo subcontractor; "approved" = proposta aprovada.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [bidRequests],
};

/* ------------------------------------------------------------------ */
/* Accounts Payable                                                    */
/* ------------------------------------------------------------------ */

const accountsPayable: HelpTool = {
  name: "accounts_payable",
  description:
    "Contas a pagar da empresa: totais (geral, pago, a pagar, maior conta) e lista com nome, descrição, valor e data de pagamento. Filtros: situation (unpaid, paid, all) e search no nome ou descrição.",
  readOnly: true,
  parameters: {
    type: "object",
    properties: {
      situation: { type: "string", enum: ["unpaid", "paid", "all"] },
      search: { type: "string" },
      limit: { type: "number", description: "Padrão 30, máx. 100" },
    },
  },
  async run(args, ctx) {
    const companyId = ctx.companyId!;
    const situation = args.situation === "paid" || args.situation === "all" ? args.situation : "unpaid";
    const search = text(args.search);
    const where: Prisma.AccountPayableWhereInput = {
      companyId,
      ...(situation === "paid" ? { paidAt: { not: null } } : situation === "unpaid" ? { paidAt: null } : {}),
      ...(search ? { OR: [{ name: { contains: search } }, { description: { contains: search } }] } : {}),
    };
    const [all, total, rows] = await Promise.all([
      prisma.accountPayable.findMany({ where: { companyId }, select: { name: true, amount: true, paidAt: true } }),
      prisma.accountPayable.count({ where }),
      prisma.accountPayable.findMany({
        where,
        take: clampLimit(args.limit, 30),
        orderBy: [{ amount: "desc" }],
        select: { name: true, description: true, amount: true, paidAt: true, createdAt: true },
      }),
    ]);
    const sum = (items: typeof all) => items.reduce((acc, item) => acc + money(item.amount), 0);
    const paid = all.filter((item) => item.paidAt);
    const unpaid = all.filter((item) => !item.paidAt);
    const biggest = [...all].sort((a, b) => money(b.amount) - money(a.amount))[0];
    return {
      totals: {
        accounts: all.length,
        totalUsd: usd(sum(all)),
        paidUsd: usd(sum(paid)),
        unpaidUsd: usd(sum(unpaid)),
        unpaidCount: unpaid.length,
        biggestAccount: biggest ? { name: biggest.name, amountUsd: usd(money(biggest.amount)) } : null,
      },
      situation,
      totalMatching: total,
      items: rows.map((row) => ({
        name: row.name,
        description: row.description || null,
        amountUsd: usd(money(row.amount)),
        paid: Boolean(row.paidAt),
        paidAt: dateOnly(row.paidAt),
        createdAt: dateOnly(row.createdAt),
      })),
    };
  },
  buildReport: (_args, output) => {
    const report = tableReport(
      "Accounts Payable",
      `${output?.totalMatching ?? 0} accounts (${output?.situation})`,
      [["name", "Account"], ["description", "Description"], ["amountUsd", "Amount"], ["paid", "Paid"], ["paidAt", "Paid on"]],
      (output?.items ?? []).map((i: any) => ({ name: i.name, description: i.description, amountUsd: i.amountUsd, paid: i.paid ? "Yes" : "No", paidAt: i.paidAt }))
    );
    if (report && output?.totals) {
      report.metrics = [
        { label: "Total", value: output.totals.totalUsd },
        { label: "Paid", value: output.totals.paidUsd, tone: "success" },
        { label: "To pay", value: output.totals.unpaidUsd, tone: "warning" },
      ];
    }
    return report;
  },
};

const OWNER_OFFICES = new Set(["owner", "administrator", "master"]);

export const accountsPayableSkill: HelpSkill = {
  id: "accounts-payable-data",
  description: "Consulta as contas a pagar da empresa (somente Owner, Administrator ou Master).",
  instructions: `
Para perguntas sobre contas a pagar (quanto falta pagar, o que já foi pago, maior conta), use accounts_payable. A tela não guarda data de vencimento, só valor e data de pagamento; não invente vencimentos.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId) && OWNER_OFFICES.has(String(ctx.officeName ?? "").trim().toLowerCase()),
  tools: [accountsPayable],
};
