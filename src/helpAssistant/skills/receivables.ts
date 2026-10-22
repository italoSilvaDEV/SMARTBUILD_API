import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { PENDING_INVOICE_STATUSES } from "../../utils/invoiceListFilters";
import { HelpSkill, HelpTool } from "../types";

/**
 * Consultas de faturas e recebíveis com a mesma regra da tela de Invoices
 * e do Dashboard: pendente = open, draft ou partial; void e uncollectible
 * não contam como em aberto; faturas Stripe substituídas por edição
 * (cancel_invoice_edit) são ignoradas; parcial usa o saldo restante.
 *
 * Substituem as versões do IA Assistant antigo, que somavam faturas void
 * como em aberto e só totalizavam os primeiros registros.
 */

const PENDING = [...PENDING_INVOICE_STATUSES] as string[];
const NOT_SUPERSEDED: Prisma.InvoiceWhereInput = {
  OR: [{ cancel_invoice_edit: false }, { cancel_invoice_edit: null }],
};

const PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "last90Days", "thisYear", "lastYear", "allPeriod"];

function resolvePeriod(args: Record<string, unknown>): { gte?: Date; lte?: Date; label: string } {
  const start = typeof args.startDate === "string" ? new Date(args.startDate) : null;
  const end = typeof args.endDate === "string" ? new Date(args.endDate) : null;
  if (start && !Number.isNaN(start.getTime())) {
    const lte = end && !Number.isNaN(end.getTime()) ? end : undefined;
    if (lte) lte.setHours(23, 59, 59, 999);
    return { gte: start, lte, label: `${args.startDate} → ${args.endDate ?? "hoje"}` };
  }

  const now = new Date();
  const period = typeof args.period === "string" && PERIODS.includes(args.period) ? args.period : "allPeriod";
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const monday = (date: Date) => {
    const day = startOfDay(date);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return day;
  };

  switch (period) {
    case "thisWeek":
      return { gte: monday(now), label: period };
    case "lastWeek": {
      const thisMonday = monday(now);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      return { gte: lastMonday, lte: new Date(thisMonday.getTime() - 1), label: period };
    }
    case "thisMonth":
      return { gte: new Date(now.getFullYear(), now.getMonth(), 1), label: period };
    case "lastMonth":
      return {
        gte: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        lte: new Date(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1),
        label: period,
      };
    case "last30Days":
      return { gte: new Date(now.getTime() - 30 * 86400000), label: period };
    case "last90Days":
      return { gte: new Date(now.getTime() - 90 * 86400000), label: period };
    case "thisYear":
      return { gte: new Date(now.getFullYear(), 0, 1), label: period };
    case "lastYear":
      return {
        gte: new Date(now.getFullYear() - 1, 0, 1),
        lte: new Date(new Date(now.getFullYear(), 0, 1).getTime() - 1),
        label: period,
      };
    default:
      return { label: "allPeriod" };
  }
}

const money = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);
const round = (value: number) => Math.round(value * 100) / 100;
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
/** Valor já formatado: o modelo deve copiar este texto em vez de reescrever o número. */
const usd = (value: number) => USD.format(round(value));

/** Valor ainda devido: saldo restante quando existir (parciais/QBO), senão o total. */
function outstanding(invoice: { status: string; totalAmount: Prisma.Decimal; balanceRemaining: Prisma.Decimal | null }) {
  if (invoice.balanceRemaining !== null && invoice.balanceRemaining !== undefined) return money(invoice.balanceRemaining);
  return money(invoice.totalAmount);
}

const periodParams = {
  period: { type: "string", enum: PERIODS, description: "Período pela data de criação da fatura." },
  startDate: { type: "string", description: "YYYY-MM-DD (alternativa a period)" },
  endDate: { type: "string", description: "YYYY-MM-DD" },
};

const invoiceSelect = {
  id: true,
  status: true,
  totalAmount: true,
  balanceRemaining: true,
  dueDate: true,
  createdAt: true,
  invoiceType: true,
  project: {
    select: {
      id: true,
      contract_number: true,
      location: true,
      client: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.InvoiceSelect;

/** Totais de faturas pela regra oficial; usado também pela visão geral da empresa. */
export async function summarizeInvoices(companyId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { companyId, AND: [NOT_SUPERSEDED] },
    select: { status: true, totalAmount: true, balanceRemaining: true, dueDate: true },
  });
  const now = new Date();
  let invoiced = 0;
  let paid = 0;
  let pending = 0;
  let overdue = 0;
  let count = 0;
  for (const invoice of invoices) {
    if (invoice.status === "void") continue;
    count += 1;
    invoiced += money(invoice.totalAmount);
    if (invoice.status === "paid") paid += money(invoice.totalAmount);
    else if (PENDING.includes(invoice.status)) {
      pending += outstanding(invoice);
      if (invoice.dueDate && invoice.dueDate < now) overdue += outstanding(invoice);
    }
  }
  return {
    invoiceCountExcludingCanceled: count,
    invoicedUsd: usd(invoiced),
    paidUsd: usd(paid),
    pendingUsd: usd(pending),
    overdueUsd: usd(overdue),
  };
}

async function pendingInvoices(companyId: string) {
  return prisma.invoice.findMany({
    where: { companyId, status: { in: PENDING }, AND: [NOT_SUPERSEDED] },
    select: invoiceSelect,
  });
}

const receivableTools: HelpTool[] = [
  {
    name: "invoice_summary",
    description:
      "Resumo de faturas da empresa no período (pela data de criação): quantidade e valor por situação (paid, pending, overdue, canceled/void, uncollectible) e total recebido.",
    readOnly: true,
    requiredPermissions: ["Invoice"],
    parameters: { type: "object", properties: periodParams },
    async run(args, ctx) {
      const range = resolvePeriod(args);
      const invoices = await prisma.invoice.findMany({
        where: {
          companyId: ctx.companyId!,
          AND: [NOT_SUPERSEDED],
          ...(range.gte || range.lte ? { createdAt: { gte: range.gte, lte: range.lte } } : {}),
        },
        select: { status: true, totalAmount: true, balanceRemaining: true, dueDate: true },
      });

      const now = new Date();
      const groups: Record<string, { count: number; amount: number }> = {};
      const add = (key: string, amount: number) => {
        groups[key] = groups[key] ?? { count: 0, amount: 0 };
        groups[key].count += 1;
        groups[key].amount += amount;
      };
      for (const invoice of invoices) {
        if (invoice.status === "paid") add("paid", money(invoice.totalAmount));
        else if (invoice.status === "void") add("canceled", money(invoice.totalAmount));
        else if (invoice.status === "uncollectible") add("uncollectible", money(invoice.totalAmount));
        else if (PENDING.includes(invoice.status)) {
          add("pending", outstanding(invoice));
          if (invoice.dueDate && invoice.dueDate < now) add("overdue", outstanding(invoice));
        }
      }

      return {
        period: range.label,
        rule: "pending = open, draft ou partial (valor = saldo restante); overdue = pending com vencimento passado; void e uncollectible não contam como em aberto",
        totalInvoices: invoices.length,
        totalInvoicedExcludingCanceledUsd: usd(
          invoices.filter((invoice) => invoice.status !== "void").reduce((acc, invoice) => acc + money(invoice.totalAmount), 0)
        ),
        byStatus: Object.fromEntries(
          Object.entries(groups).map(([key, value]) => [key, { count: value.count, amount: round(value.amount), amountUsd: usd(value.amount) }])
        ),
      };
    },
  },
  {
    name: "overdue_invoices",
    description:
      "Faturas vencidas (pendentes com vencimento passado): total geral de todas elas e a lista das mais antigas. Pode filtrar por nome do cliente.",
    readOnly: true,
    requiredPermissions: ["Invoice"],
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Quantas listar (padrão 15, máx. 50). O total sempre considera todas." },
        clientName: { type: "string" },
      },
    },
    async run(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
      const clientName = typeof args.clientName === "string" ? args.clientName.trim().toLowerCase() : "";
      const now = new Date();
      const overdue = (await pendingInvoices(ctx.companyId!))
        .filter((invoice) => invoice.dueDate && invoice.dueDate < now)
        .filter((invoice) => !clientName || (invoice.project?.client?.name ?? "").toLowerCase().includes(clientName))
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

      return {
        overdueCount: overdue.length,
        overdueAmountUsd: usd(overdue.reduce((acc, invoice) => acc + outstanding(invoice), 0)),
        listed: Math.min(limit, overdue.length),
        items: overdue.slice(0, limit).map((invoice) => ({
          status: invoice.status,
          outstanding: round(outstanding(invoice)),
          outstandingUsd: usd(outstanding(invoice)),
          totalAmountUsd: usd(money(invoice.totalAmount)),
          dueDate: invoice.dueDate,
          daysOverdue: Math.floor((now.getTime() - invoice.dueDate!.getTime()) / 86400000),
          client: invoice.project?.client?.name ?? null,
          contractNumber: invoice.project?.contract_number ?? null,
          projectAddress: invoice.project?.location ?? null,
        })),
      };
    },
  },
  {
    name: "invoice_aging",
    description: "Aging de recebíveis: valor pendente por faixa de atraso (a vencer, 1-30, 31-60, 61-90, 90+ dias).",
    readOnly: true,
    requiredPermissions: ["Invoice"],
    parameters: { type: "object", properties: {} },
    async run(_args, ctx) {
      const now = new Date();
      const buckets: Record<string, { count: number; amount: number }> = {
        notDueYet: { count: 0, amount: 0 },
        "1-30": { count: 0, amount: 0 },
        "31-60": { count: 0, amount: 0 },
        "61-90": { count: 0, amount: 0 },
        "90+": { count: 0, amount: 0 },
      };
      for (const invoice of await pendingInvoices(ctx.companyId!)) {
        const days = invoice.dueDate ? Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86400000) : -1;
        const key = days <= 0 ? "notDueYet" : days <= 30 ? "1-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "90+";
        buckets[key].count += 1;
        buckets[key].amount += outstanding(invoice);
      }
      return Object.fromEntries(
        Object.entries(buckets).map(([key, value]) => [key, { count: value.count, amount: round(value.amount), amountUsd: usd(value.amount) }])
      );
    },
  },
  {
    name: "receivables_by_client",
    description: "Valor pendente (a receber) por cliente, com quanto disso está vencido. Ordenado do maior para o menor.",
    readOnly: true,
    requiredPermissions: ["Invoice"],
    parameters: { type: "object", properties: { limit: { type: "number", description: "Padrão 10, máx. 50." } } },
    async run(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const now = new Date();
      const byClient = new Map<string, { client: string; pending: number; overdue: number; invoices: number }>();
      for (const invoice of await pendingInvoices(ctx.companyId!)) {
        const name = invoice.project?.client?.name ?? "Sem cliente";
        const entry = byClient.get(name) ?? { client: name, pending: 0, overdue: 0, invoices: 0 };
        const value = outstanding(invoice);
        entry.pending += value;
        entry.invoices += 1;
        if (invoice.dueDate && invoice.dueDate < now) entry.overdue += value;
        byClient.set(name, entry);
      }
      const rows = [...byClient.values()].sort((a, b) => b.pending - a.pending);
      return {
        clientCount: rows.length,
        totalPendingUsd: usd(rows.reduce((acc, row) => acc + row.pending, 0)),
        items: rows.slice(0, limit).map((row) => ({
          ...row,
          pending: round(row.pending),
          pendingUsd: usd(row.pending),
          overdue: round(row.overdue),
          overdueUsd: usd(row.overdue),
        })),
      };
    },
  },
  {
    name: "cashflow_projection",
    description:
      "Projeção de entrada de caixa: valor pendente já vencido e valor a vencer nos próximos N dias (padrão 30, máx. 90), com as principais faturas de cada grupo.",
    readOnly: true,
    requiredPermissions: ["Invoice"],
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "Janela futura em dias (padrão 30, máx. 90)." },
        clientName: { type: "string" },
      },
    },
    async run(args, ctx) {
      const days = Math.min(Math.max(Number(args.days) || 30, 1), 90);
      const clientName = typeof args.clientName === "string" ? args.clientName.trim().toLowerCase() : "";
      const now = new Date();
      const horizon = new Date(now.getTime() + days * 86400000);
      const pending = (await pendingInvoices(ctx.companyId!)).filter(
        (invoice) => !clientName || (invoice.project?.client?.name ?? "").toLowerCase().includes(clientName)
      );

      const overdue = pending.filter((invoice) => invoice.dueDate && invoice.dueDate < now);
      const upcoming = pending
        .filter((invoice) => invoice.dueDate && invoice.dueDate >= now && invoice.dueDate <= horizon)
        .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
      const withoutDueDate = pending.filter((invoice) => !invoice.dueDate);
      const sum = (rows: typeof pending) => rows.reduce((acc, invoice) => acc + outstanding(invoice), 0);
      const describe = (invoice: (typeof pending)[number]) => ({
        outstandingUsd: usd(outstanding(invoice)),
        dueDate: invoice.dueDate,
        client: invoice.project?.client?.name ?? null,
        projectId: invoice.project?.id ?? null,
        projectAddress: invoice.project?.location ?? null,
        contractNumber: invoice.project?.contract_number ?? null,
      });

      return {
        windowDays: days,
        overdue: { count: overdue.length, amount: round(sum(overdue)), amountUsd: usd(sum(overdue)) },
        dueInWindow: { count: upcoming.length, amount: round(sum(upcoming)), amountUsd: usd(sum(upcoming)) },
        withoutDueDate: { count: withoutDueDate.length, amountUsd: usd(sum(withoutDueDate)) },
        topOverdue: [...overdue].sort((a, b) => outstanding(b) - outstanding(a)).slice(0, 8).map(describe),
        upcoming: upcoming.slice(0, 8).map(describe),
      };
    },
  },
  {
    name: "client_risk_analysis",
    description:
      "Risco de inadimplência por cliente: faturado, recebido, em aberto, vencido, incobrável (uncollectible) e um índice de risco de 0 a 1. Ordenado do maior risco para o menor.",
    readOnly: true,
    requiredPermissions: ["Invoice"],
    parameters: { type: "object", properties: { limit: { type: "number", description: "Padrão 10, máx. 25." } } },
    async run(args, ctx) {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);
      const now = new Date();
      const invoices = await prisma.invoice.findMany({
        where: { companyId: ctx.companyId!, status: { not: "void" }, AND: [NOT_SUPERSEDED] },
        select: invoiceSelect,
      });

      type Row = { client: string; clientId: string; invoiced: number; paid: number; open: number; overdue: number; uncollectible: number; invoices: number; overdueInvoices: number };
      const byClient = new Map<string, Row>();
      for (const invoice of invoices) {
        const client = invoice.project?.client;
        if (!client) continue;
        const row =
          byClient.get(client.id) ??
          { client: client.name, clientId: client.id, invoiced: 0, paid: 0, open: 0, overdue: 0, uncollectible: 0, invoices: 0, overdueInvoices: 0 };
        const total = money(invoice.totalAmount);
        row.invoiced += total;
        row.invoices += 1;
        if (invoice.status === "paid") row.paid += total;
        else if (invoice.status === "uncollectible") row.uncollectible += total;
        else if (PENDING.includes(invoice.status)) {
          row.open += outstanding(invoice);
          if (invoice.dueDate && invoice.dueDate < now) {
            row.overdue += outstanding(invoice);
            row.overdueInvoices += 1;
          }
        }
        byClient.set(client.id, row);
      }

      const rows = [...byClient.values()].map((row) => {
        const exposure = row.open + row.uncollectible;
        const overdueRatio = exposure > 0 ? (row.overdue + row.uncollectible) / exposure : 0;
        const invoiceShare = row.invoices > 0 ? row.overdueInvoices / row.invoices : 0;
        const sizeWeight = Math.min(exposure / 100000, 1);
        return { ...row, riskScore: Math.round(Math.min(overdueRatio * 0.6 + invoiceShare * 0.25 + sizeWeight * 0.15, 1) * 100) / 100 };
      });
      rows.sort((a, b) => b.riskScore - a.riskScore || b.overdue - a.overdue);

      return {
        rule: "riskScore = 60% fatia vencida/incobrável do valor exposto + 25% fatia de faturas vencidas + 15% tamanho da exposição (teto $100k). Canceled não entra.",
        clientCount: rows.length,
        items: rows.slice(0, limit).map((row) => ({
          client: row.client,
          clientId: row.clientId,
          riskScore: row.riskScore,
          invoices: row.invoices,
          overdueInvoices: row.overdueInvoices,
          invoicedUsd: usd(row.invoiced),
          paidUsd: usd(row.paid),
          openUsd: usd(row.open),
          overdueUsd: usd(row.overdue),
          uncollectibleUsd: usd(row.uncollectible),
        })),
      };
    },
  },
];
export const receivablesSkill: HelpSkill = {
  id: "receivables",
  description: "Faturas e recebíveis da empresa com a regra oficial de status.",
  instructions: `
Para faturas, valores em aberto, vencidos, aging e recebíveis por cliente, use as ferramentas invoice_summary, overdue_invoices, invoice_aging, receivables_by_client, cashflow_projection e client_risk_analysis.
- Em aberto (pending) = Draft, Pending (open) ou Partial; para Partial vale o saldo restante. Canceled (void) e Uncollectible não são valores em aberto.
- Informe o total geral (overdueAmountUsd/totalPendingUsd), não a soma só dos itens listados.
- Para valores em dinheiro, copie exatamente os campos terminados em "Usd" (ex.: "$10,000,094.50"). Não reescreva nem reescale números.
- Ao exibir status para o usuário, use os rótulos da tela: open → Pending, void → Canceled.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: receivableTools,
};
