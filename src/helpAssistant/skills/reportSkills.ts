import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { compactForModel } from "../compact";
import { canSeeProject, invoiceScope, NO_PROJECT_ACCESS, projectIdFilter } from "../projectScope";
import { buildAutoReport } from "../reportAssembly";
import { AUTO_REPORT_KEY, HelpReport, HelpSkill, HelpTool } from "../types";
import { annotateMoney, runLegacyQuery } from "./companyData";
import { receivablesSkill, summarizeInvoices } from "./receivables";

/**
 * Skills de relatório completo, cruzamento entre projetos, mão de obra por
 * período, subcontractors e orçado vs realizado.
 *
 * Todas só orquestram as consultas de leitura que já existem (a ponte do
 * módulo antigo), em paralelo, e devolvem um relatório em seções que o
 * front exporta em um único PDF/Excel.
 */

const PROJECT_FINANCE = ["Projects", "Invoice"];
const PERIODS = ["thisWeek", "lastWeek", "thisMonth", "lastMonth", "last30Days", "thisYear"];
const ACTIVE_STATUSES = ["Pre-Start", "In Progress", "Final walkthrough"];
/** Teto de projetos por relatório. As consultas por projeto são rápidas (73 projetos x 2 consultas < 1s), então cobre a empresa toda. */
const MAX_PROJECTS = 500;
const POOL_SIZE = 8;

/** Executa fn sobre os itens com no máximo `size` em paralelo, preservando a ordem. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

type Cell = string | number | null;

type QuerySpec = { key: string; tool: string; args: Record<string, unknown> };

/** Roda as consultas em paralelo; uma que falha vira ausência, não derruba o relatório. */
async function runQueries(specs: QuerySpec[], companyId: string) {
  const settled = await Promise.all(
    specs.map(async (spec) => {
      try {
        return { spec, output: await runLegacyQuery(spec.tool, spec.args, companyId) };
      } catch (error) {
        console.error(`[HelpAssistant] report query ${spec.tool} failed:`, error);
        return { spec, output: null };
      }
    })
  );
  const outputs: Record<string, any> = {};
  const sections: HelpReport[] = [];
  for (const { spec, output } of settled) {
    if (output == null) continue;
    outputs[spec.key] = output;
    const section = buildAutoReport(spec.tool, spec.args, output);
    if (section) sections.push(section);
  }
  return { outputs, sections };
}

function compactOutputs(outputs: Record<string, any>) {
  const perKey = Math.max(1500, Math.floor(12000 / Math.max(Object.keys(outputs).length, 1)));
  return Object.fromEntries(Object.entries(outputs).map(([key, value]) => [key, compactForModel(annotateMoney(value), perKey)]));
}

function wrap(report: HelpReport, outputs: Record<string, any>) {
  return { [AUTO_REPORT_KEY]: report, output: compactOutputs(outputs) };
}

function periodArg(args: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  if (typeof args.period === "string" && PERIODS.includes(args.period)) out.period = args.period;
  if (typeof args.startDate === "string") out.startDate = args.startDate;
  if (typeof args.endDate === "string") out.endDate = args.endDate;
  return out;
}

const PERIOD_PROPS = {
  period: { type: "string", enum: PERIODS },
  startDate: { type: "string", description: "YYYY-MM-DD" },
  endDate: { type: "string", description: "YYYY-MM-DD" },
};

const num = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

/** Transforma a saída das tools nativas (formatos variados) em uma seção de tabela. */
function genericSection(title: string, output: any, groupLabel = "Group"): HelpReport | null {
  if (!output || typeof output !== "object" || output.error) return null;
  const humanize = (key: string) =>
    key === "group"
      ? groupLabel
      : key
      .replace(/Usd$/, "")
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase());
  const isScalar = (value: unknown) => value === null || ["string", "number", "boolean"].includes(typeof value);

  const arrayKey = Object.keys(output).find((key) => Array.isArray(output[key]) && output[key].length && typeof output[key][0] === "object");
  let rows: Record<string, Cell>[];
  if (arrayKey) {
    rows = output[arrayKey].map((item: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(item).filter(([key, value]) => !/(^id$|Id$)/.test(key) && isScalar(value)) as [string, Cell][])
    );
  } else {
    rows = Object.entries(output)
      .filter(([, value]) => value && typeof value === "object" && !Array.isArray(value))
      .map(([key, value]) => ({ group: key, ...(value as Record<string, Cell>) }));
  }
  if (!rows.length || !Object.keys(rows[0]).length) return null;

  // Se existe "xUsd", mostra só ele (já formatado) e esconde o "x" numérico.
  const keys = Object.keys(rows[0]).filter((key) => rows[0][`${key}Usd`] === undefined);
  return { title, table: { columns: keys.map((key) => ({ key, label: humanize(key) })), rows } };
}

const NATIVE_RECEIVABLES = ["invoice_aging", "overdue_invoices", "receivables_by_client"] as const;
const NATIVE_TITLES: Record<string, string> = {
  invoice_aging: "Receivables Aging",
  overdue_invoices: "Overdue Invoices",
  receivables_by_client: "Receivables by Client",
};

/* ------------------------------------------------------------------ */
/* Relatório completo                                                  */
/* ------------------------------------------------------------------ */

const projectFullReport: HelpTool = {
  name: "project_full_report",
  description:
    "Relatório COMPLETO de um projeto em seções: visão geral, custos, margem, faturas, change orders, equipe, tarefas, risco de prazo e orçado vs realizado. Use quando o usuário pedir relatório completo/geral/PDF de um projeto.",
  readOnly: true,
  requiredPermissions: PROJECT_FINANCE,
  requiresFullProjectAccess: true,
  projectScoped: true,
  parameters: {
    type: "object",
    properties: { projectId: { type: "string" } },
    required: ["projectId"],
  },
  async run(args, ctx) {
    const projectId = typeof args.projectId === "string" ? args.projectId : "";
    if (!projectId || !ctx.companyId) return { error: "projectId is required" };
    if (!canSeeProject(ctx, projectId)) return NO_PROJECT_ACCESS;
    const base = { projectId };
    const { outputs, sections } = await runQueries(
      [
        { key: "overview", tool: "get_project_details", args: base },
        { key: "cost", tool: "project_cost_breakdown", args: base },
        { key: "margin", tool: "project_margin_analysis", args: base },
        { key: "estimate", tool: "project_vs_estimate", args: base },
        { key: "invoices", tool: "project_invoices_detail", args: base },
        { key: "changeOrders", tool: "project_change_orders_detail", args: base },
        { key: "team", tool: "project_team_detail", args: base },
        { key: "tasks", tool: "project_tasks_detail", args: base },
        { key: "schedule", tool: "project_schedule_risk", args: base },
      ],
      ctx.companyId
    );
    if (!sections.length) return { error: "no data found for this project" };
    const label = outputs.overview?.projectAddress ?? outputs.overview?.projectName ?? projectId;
    return wrap({ title: `Project Report - ${label}`, description: outputs.overview?.clientName ?? undefined, sections }, outputs);
  },
};

const companyFullReport: HelpTool = {
  name: "company_full_report",
  description:
    "Relatório COMPLETO e detalhado da empresa em seções: visão geral e faturas, projetos por status, recebíveis (aging, vencidas, por cliente), projetos que mais gastam, mais lucrativos e comparação de períodos. Use SEMPRE que o usuário pedir relatório completo/geral/de custos da empresa.",
  readOnly: true,
  requiredPermissions: PROJECT_FINANCE,
  requiresFullProjectAccess: true,
  parameters: { type: "object", properties: { limit: { type: "number", description: "Itens por ranking (padrão 10, máx. 25)" } } },
  async run(args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const companyId = ctx.companyId;
    const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 25);

    const [statusGroups, clients, invoices, queries, natives] = await Promise.all([
      prisma.project.groupBy({ by: ["status_project"], where: { company_id: companyId }, _count: { _all: true }, _sum: { price: true } }),
      prisma.client.count({ where: { company_id: companyId } }),
      summarizeInvoices(companyId, invoiceScope(ctx)),
      runQueries(
        [
          { key: "topSpending", tool: "top_spending_projects", args: { limit } },
          { key: "topProfitable", tool: "top_profitable_projects", args: { limit } },
          { key: "periodComparison", tool: "financial_period_comparison", args: { period: "last30Days" } },
        ],
        companyId
      ),
      Promise.all(
        NATIVE_RECEIVABLES.filter(() => ctx.permissions.includes("Invoice")).map(async (name) => {
          const tool = receivablesSkill.tools?.find((item) => item.name === name);
          try {
            return { name, output: tool ? await tool.run(name === "invoice_aging" ? {} : { limit }, ctx) : null };
          } catch (error) {
            console.error(`[HelpAssistant] company_full_report ${name} failed:`, error);
            return { name, output: null };
          }
        })
      ),
    ]);

    const totalProjects = statusGroups.reduce((acc, group) => acc + group._count._all, 0);
    const activeProjects = statusGroups
      .filter((group) => ACTIVE_STATUSES.includes(group.status_project))
      .reduce((acc, group) => acc + group._count._all, 0);

    const overview: HelpReport = {
      title: "Company Overview",
      description: "Projects, clients and invoices (canceled invoices excluded; overdue = pending past due date)",
      metrics: [
        { label: "Active projects", value: String(activeProjects), tone: "success" },
        { label: "Total projects", value: String(totalProjects) },
        { label: "Clients", value: String(clients) },
        { label: "Invoiced", value: invoices.invoicedUsd },
        { label: "Paid", value: invoices.paidUsd, tone: "success" },
        { label: "Pending", value: invoices.pendingUsd, tone: "warning" },
        { label: "Overdue", value: invoices.overdueUsd, tone: "warning" },
      ],
      table: {
        columns: [
          { key: "status", label: "Project status" },
          { key: "projects", label: "Projects" },
          { key: "value", label: "Sold value" },
        ],
        rows: [...statusGroups]
          .sort((a, b) => b._count._all - a._count._all)
          .map((group) => ({ status: group.status_project, projects: group._count._all, value: usd(Number(group._sum.price ?? 0)) })),
      },
    };

    const receivableSections = natives
      .map(({ name, output }) => genericSection(NATIVE_TITLES[name], output, "Bucket"))
      .filter((section): section is HelpReport => section !== null);

    return wrap(
      {
        title: "Company Report",
        description: "Overview, receivables, cost and profit rankings, period comparison",
        sections: [overview, ...receivableSections, ...queries.sections],
      },
      {
        overview: { activeProjects, totalProjects, clients, invoices },
        ...Object.fromEntries(natives.map(({ name, output }) => [name, output])),
        ...queries.outputs,
      }
    );
  },
};

export const fullReportSkill: HelpSkill = {
  id: "full-report",
  description: "Relatórios completos em seções (projeto e empresa), exportáveis em PDF.",
  instructions: `
Para "relatório completo", "relatório geral", "relatório do projeto" ou "PDF do projeto", use project_full_report (precisa do projectId; se só houver o endereço/cliente, ache o id com list_projects antes) ou company_full_report para a empresa. O relatório em seções é anexado automaticamente, com botões Excel e PDF. "PDF com todos os custos" sem escopo = relatório da empresa toda (company_full_report); não pergunte o escopo. O PDF é baixado pelos botões abaixo da resposta: nunca mande o usuário para a tela Reports.
Depois da ferramenta, responda com um resumo curto: situação, margem, principais riscos e pendências. Não repita as tabelas em texto.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [projectFullReport, companyFullReport],
};

/* ------------------------------------------------------------------ */
/* Busca mista entre projetos                                          */
/* ------------------------------------------------------------------ */

const METRICS = ["cost", "margin", "invoices", "estimate", "team", "changeOrders", "schedule"] as const;
type Metric = (typeof METRICS)[number];

const METRIC_QUERY: Record<Metric, string> = {
  cost: "project_cost_breakdown",
  margin: "project_margin_analysis",
  invoices: "project_invoices_detail",
  estimate: "project_vs_estimate",
  team: "project_team_detail",
  changeOrders: "project_change_orders_detail",
  schedule: "project_schedule_risk",
};

/** Colunas extraídas da saída de cada consulta, por métrica. */
const METRIC_COLUMNS: Record<Metric, { columns: { key: string; label: string }[]; pick: (output: any) => Record<string, Cell> }> = {
  cost: {
    columns: [
      { key: "materials", label: "Materials" },
      { key: "employees", label: "Employee cost" },
      { key: "subs", label: "Subcontractors" },
      { key: "totalCost", label: "Total cost" },
    ],
    pick: (o) => ({
      materials: usd(num(o?.totals?.materialCost)),
      employees: usd(num(o?.totals?.internalLaborCost)),
      subs: usd(num(o?.totals?.subcontractorCost)),
      totalCost: usd(num(o?.totals?.totalCost)),
    }),
  },
  margin: {
    columns: [
      { key: "sold", label: "Sold value" },
      { key: "margin", label: "Margin" },
      { key: "marginPct", label: "Margin %" },
      { key: "balanceDue", label: "Balance due" },
    ],
    pick: (o) => ({
      sold: usd(num(o?.soldValue)),
      margin: usd(num(o?.margin?.value)),
      marginPct: `${(num(o?.margin?.percentage) * 100).toFixed(1)}%`,
      balanceDue: usd(num(o?.balanceDue)),
    }),
  },
  invoices: {
    columns: [
      { key: "invoiceCount", label: "Invoices" },
      { key: "openAmount", label: "Open" },
      { key: "overdueAmount", label: "Overdue" },
    ],
    pick: (o) => ({
      invoiceCount: num(o?.totals?.invoiceCount),
      openAmount: usd(num(o?.totals?.openAmount)),
      overdueAmount: usd(num(o?.totals?.overdueAmount)),
    }),
  },
  estimate: {
    columns: [
      { key: "latestEstimate", label: "Latest estimate" },
      { key: "soldVsEstimate", label: "Sold vs estimate" },
      { key: "estimateVsCost", label: "Estimate vs cost" },
    ],
    pick: (o) => ({
      latestEstimate: o?.latestEstimate ? usd(num(o.latestEstimate.totalAmount)) : null,
      soldVsEstimate: usd(num(o?.deltas?.soldVsEstimate)),
      estimateVsCost: usd(num(o?.deltas?.estimateVsCost)),
    }),
  },
  team: {
    columns: [
      { key: "employees", label: "Employees" },
      { key: "subcontractors", label: "Subcontractors" },
      { key: "hours", label: "Hours" },
    ],
    pick: (o) => ({
      employees: num(o?.totals?.employeeCount),
      subcontractors: num(o?.totals?.subcontractorCount),
      hours: Math.round(num(o?.totals?.totalHours) * 10) / 10,
    }),
  },
  changeOrders: {
    columns: [
      { key: "coCount", label: "Change orders" },
      { key: "coApproved", label: "CO approved" },
      { key: "coPending", label: "CO pending" },
    ],
    pick: (o) => ({
      coCount: num(o?.totals?.count),
      coApproved: usd(num(o?.totals?.approvedAmount)),
      coPending: usd(num(o?.totals?.pendingAmount)),
    }),
  },
  schedule: {
    columns: [
      { key: "risk", label: "Schedule risk" },
      { key: "daysToDeadline", label: "Days to deadline" },
      { key: "openTasks", label: "Open tasks" },
    ],
    pick: (o) => ({ risk: o?.riskLevel ?? null, daysToDeadline: o?.daysToDeadline ?? null, openTasks: num(o?.openTasks) }),
  },
};

const MONEY_KEYS = new Set(["materials", "employees", "subs", "totalCost", "sold", "margin", "balanceDue", "openAmount", "overdueAmount", "latestEstimate", "soldVsEstimate", "estimateVsCost", "coApproved", "coPending"]);

/** Valores numéricos brutos por coluna, usados para ordenar e somar (as colunas da tabela são texto formatado). */
const METRIC_RAW: Record<Metric, (o: any) => Record<string, number>> = {
  cost: (o) => ({ materials: num(o?.totals?.materialCost), employees: num(o?.totals?.internalLaborCost), subs: num(o?.totals?.subcontractorCost), totalCost: num(o?.totals?.totalCost) }),
  margin: (o) => ({ sold: num(o?.soldValue), margin: num(o?.margin?.value), balanceDue: num(o?.balanceDue) }),
  invoices: (o) => ({ invoiceCount: num(o?.totals?.invoiceCount), openAmount: num(o?.totals?.openAmount), overdueAmount: num(o?.totals?.overdueAmount) }),
  estimate: (o) => ({ soldVsEstimate: num(o?.deltas?.soldVsEstimate), estimateVsCost: num(o?.deltas?.estimateVsCost) }),
  team: (o) => ({ hours: num(o?.totals?.totalHours) }),
  changeOrders: (o) => ({ coCount: num(o?.totals?.count), coApproved: num(o?.totals?.approvedAmount), coPending: num(o?.totals?.pendingAmount) }),
  schedule: (o) => ({ openTasks: num(o?.openTasks) }),
};

/** Coluna usada para ordenar quando o usuário não pede outra (maior primeiro). */
const DEFAULT_SORT: Record<Metric, string> = { cost: "totalCost", margin: "margin", invoices: "overdueAmount", estimate: "estimateVsCost", team: "hours", changeOrders: "coPending", schedule: "openTasks" };

function formatTotal(key: string, value: number) {
  return MONEY_KEYS.has(key) ? usd(Math.round(value * 100) / 100) : Math.round(value * 10) / 10;
}

async function resolveProjects(args: Record<string, unknown>, companyId: string, ctx: { visibleProjectIds: string[] | null }) {
  const ids = Array.isArray(args.projectIds) ? args.projectIds.filter((id): id is string => typeof id === "string").slice(0, MAX_PROJECTS) : [];
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const requested = Array.isArray(args.status) ? args.status.filter((s): s is string => typeof s === "string") : [];
  const statuses = requested.length ? requested : ACTIVE_STATUSES;

  const scope = projectIdFilter(ctx as any);
  const where: Prisma.ProjectWhereInput = ids.length
    ? { company_id: companyId, id: { in: ctx.visibleProjectIds ? ids.filter((id) => ctx.visibleProjectIds!.includes(id)) : ids } }
    : {
        company_id: companyId,
        ...scope,
        status_project: { in: statuses },
        ...(search ? { OR: [{ location: { contains: search } }, { client: { name: { contains: search } } }] } : {}),
      };
  const limit = Math.min(Math.max(Number(args.limit) || MAX_PROJECTS, 1), MAX_PROJECTS);
  const [total, projects] = await Promise.all([
    prisma.project.count({ where }),
    prisma.project.findMany({
      where,
      take: limit,
      orderBy: { date_creation: "desc" },
      select: { id: true, location: true, status_project: true, client: { select: { name: true } } },
    }),
  ]);
  return { total, projects };
}

const compareProjects: HelpTool = {
  name: "compare_projects",
  description: `Cruza dados específicos de VÁRIOS projetos numa tabela só (uma linha por projeto, com linha de TOTAL). Cobre TODOS os projetos que casam com o filtro (até ${MAX_PROJECTS}), não só alguns. Escolha os campos em "metrics": ${METRICS.join(", ")}. Selecione os projetos por projectIds, ou por search/status (padrão: todos os projetos ativos). sortBy ordena do maior para o menor por uma coluna (ex.: totalCost, margin, overdueAmount); sem sortBy usa a principal da primeira métrica. limit só se o usuário pedir "os N maiores".`,
  readOnly: true,
  requiredPermissions: PROJECT_FINANCE,
  requiresFullProjectAccess: true,
  projectScoped: true,
  parameters: {
    type: "object",
    properties: {
      projectIds: { type: "array", items: { type: "string" } },
      search: { type: "string", description: "Endereço ou cliente" },
      status: { type: "array", items: { type: "string" } },
      metrics: { type: "array", items: { type: "string", enum: [...METRICS] } },
      sortBy: { type: "string", description: "Coluna: totalCost, materials, employees, subs, sold, margin, balanceDue, openAmount, overdueAmount, estimateVsCost, hours, coPending, openTasks" },
      limit: { type: "number", description: "Só para 'os N maiores/menores'. Sem isso, traz todos." },
    },
    required: ["metrics"],
  },
  async run(args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const companyId = ctx.companyId;
    const metrics = (Array.isArray(args.metrics) ? args.metrics : []).filter((m): m is Metric => METRICS.includes(m as Metric));
    if (!metrics.length) return { error: "choose at least one metric", available: METRICS };

    const { total, projects } = await resolveProjects(args, companyId, ctx);
    if (!projects.length) return { error: "no projects found", total: 0 };

    const columns = [
      { key: "address", label: "Project" },
      { key: "client", label: "Client" },
      { key: "status", label: "Status" },
      ...metrics.flatMap((metric) => METRIC_COLUMNS[metric].columns),
    ];

    const entries = await mapPool(projects, POOL_SIZE, async (project) => {
      const row: Record<string, Cell> = { address: project.location, client: project.client?.name ?? null, status: project.status_project };
      const raw: Record<string, number> = {};
      await Promise.all(
        metrics.map(async (metric) => {
          try {
            const output = await runLegacyQuery(METRIC_QUERY[metric], { projectId: project.id }, companyId);
            Object.assign(row, METRIC_COLUMNS[metric].pick(output));
            Object.assign(raw, METRIC_RAW[metric](output));
          } catch (error) {
            console.error(`[HelpAssistant] compare_projects ${metric} failed:`, error);
            for (const column of METRIC_COLUMNS[metric].columns) row[column.key] = null;
          }
        })
      );
      return { row, raw };
    });

    const requestedSort = typeof args.sortBy === "string" ? args.sortBy : "";
    const sortKey = requestedSort && entries.some((entry) => requestedSort in entry.raw) ? requestedSort : DEFAULT_SORT[metrics[0]];
    entries.sort((a, b) => (b.raw[sortKey] ?? Number.NEGATIVE_INFINITY) - (a.raw[sortKey] ?? Number.NEGATIVE_INFINITY));
    const limit = Number(args.limit) > 0 ? Math.min(Number(args.limit), MAX_PROJECTS) : entries.length;
    const shown = entries.slice(0, limit);

    // Totais das colunas somáveis.
    const sums: Record<string, number> = {};
    for (const entry of shown) for (const [key, value] of Object.entries(entry.raw)) sums[key] = (sums[key] ?? 0) + value;
    const totalRow: Record<string, Cell> = { address: `TOTAL (${shown.length} projects)`, client: null, status: null };
    for (const [key, value] of Object.entries(sums)) totalRow[key] = formatTotal(key, value);
    if (sums.sold && columns.some((column) => column.key === "marginPct")) totalRow.marginPct = `${((sums.margin / sums.sold) * 100).toFixed(1)}%`;

    const totalsMetrics = Object.entries(sums)
      .filter(([key]) => ["totalCost", "margin", "sold", "overdueAmount", "openAmount", "balanceDue", "materials"].includes(key))
      .slice(0, 6)
      .map(([key, value]) => ({ label: columns.find((column) => column.key === key)?.label ?? key, value: String(formatTotal(key, value)) }));

    const report: HelpReport = {
      title: "Project Comparison",
      description: `${shown.length} of ${total} projects - ${metrics.join(", ")} - sorted by ${sortKey}`,
      metrics: totalsMetrics,
      chartMode: sums[sortKey] !== undefined ? "bar" : undefined,
      chartData: sums[sortKey] !== undefined ? shown.slice(0, 8).map((entry) => ({ label: String(entry.row.address).slice(0, 26), value: Math.round((entry.raw[sortKey] ?? 0) * 100) / 100 })) : undefined,
      table: { columns, rows: [...shown.map((entry) => entry.row), totalRow] },
    };

    // O modelo recebe só os destaques; a tabela completa já vai anexada ao relatório.
    const pick = (list: typeof shown) => list.map((entry) => entry.row);
    return {
      [AUTO_REPORT_KEY]: report,
      output: {
        totalMatching: total,
        compared: shown.length,
        sortedBy: sortKey,
        totals: totalRow,
        top: pick(shown.slice(0, 10)),
        bottom: shown.length > 15 ? pick(shown.slice(-5)) : [],
        note: "A tabela completa (todos os projetos, com linha de total) foi anexada ao relatório; não liste todas as linhas na resposta, só os destaques.",
      },
    };
  },
};

export const crossProjectSkill: HelpSkill = {
  id: "cross-project",
  description: "Cruza dados específicos de vários projetos em uma tabela.",
  instructions: `
Para pedidos que misturam dados de vários projetos ("custo e margem dos projetos ativos", "compare faturas em aberto e change orders dos projetos de X"), use compare_projects uma vez, escolhendo em "metrics" só os campos pedidos. Não chame as ferramentas de projeto uma a uma. A tabela cruzada é anexada automaticamente; responda com os destaques (maior, menor, riscos) A ferramenta já cobre TODOS os projetos do filtro e inclui a linha de total; não precisa limitar.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [compareProjects],
};

/* ------------------------------------------------------------------ */
/* Mão de obra por período, subcontractors e orçado vs realizado       */
/* ------------------------------------------------------------------ */

const laborReport: HelpTool = {
  name: "labor_period_report",
  description:
    "Relatório de mão de obra (time cards) de um período em seções: resumo por projeto, ranking de funcionários, por projeto e funcionários vs subcontractors. Aceita projectId para um projeto só.",
  readOnly: true,
  requiredPermissions: ["Time Cards", "Subcontractors"],
  parameters: { type: "object", properties: { ...PERIOD_PROPS, projectId: { type: "string" }, workerName: { type: "string" }, limit: { type: "number" } } },
  async run(args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const scope: Record<string, unknown> = { ...periodArg(args) };
    if (typeof args.projectId === "string") scope.projectId = args.projectId;
    if (typeof args.workerName === "string") scope.workerName = args.workerName;
    const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 50);
    const { outputs, sections } = await runQueries(
      [
        { key: "summary", tool: "timecard_summary", args: scope },
        { key: "byWorker", tool: "timecards_by_worker", args: { ...scope, limit } },
        { key: "byProject", tool: "timecards_by_project", args: { ...scope, limit } },
        { key: "employeeVsSub", tool: "employee_vs_subcontractor_spend", args: scope },
      ],
      ctx.companyId
    );
    if (!sections.length) return { error: "no time card data for this scope" };
    return wrap({ title: "Labor Report", description: String(scope.period ?? "custom period"), sections }, outputs);
  },
};

const laborComparison: HelpTool = {
  name: "labor_period_comparison",
  description: "Compara a mão de obra (horas e custo dos time cards) entre dois períodos, ex.: este mês vs mês passado.",
  readOnly: true,
  requiredPermissions: ["Time Cards"],
  parameters: {
    type: "object",
    properties: { periodA: { type: "string", enum: PERIODS }, periodB: { type: "string", enum: PERIODS }, projectId: { type: "string" } },
    required: ["periodA", "periodB"],
  },
  async run(args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const a = String(args.periodA);
    const b = String(args.periodB);
    if (!PERIODS.includes(a) || !PERIODS.includes(b)) return { error: "invalid period", available: PERIODS };
    const extra = typeof args.projectId === "string" ? { projectId: args.projectId } : {};
    const [first, second] = await Promise.all([
      runLegacyQuery("timecard_summary", { period: a, ...extra }, ctx.companyId),
      runLegacyQuery("timecard_summary", { period: b, ...extra }, ctx.companyId),
    ]);
    const pct = (now: number, before: number) => (before ? `${(((now - before) / before) * 100).toFixed(1)}%` : "-");
    const row = (label: string, x: number, y: number, money: boolean): Record<string, Cell> => ({
      metric: label,
      [a]: money ? usd(x) : Math.round(x * 10) / 10,
      [b]: money ? usd(y) : Math.round(y * 10) / 10,
      variance: money ? usd(x - y) : Math.round((x - y) * 10) / 10,
      variancePct: pct(x, y),
    });
    const rows = [
      row("Labor cost", num(first?.totalCost), num(second?.totalCost), true),
      row("Hours", num(first?.totalHours), num(second?.totalHours), false),
      row("Entries", num(first?.totalEntries), num(second?.totalEntries), false),
    ];
    const report: HelpReport = {
      title: "Labor Period Comparison",
      description: `${a} vs ${b}`,
      chartMode: "bar",
      chartData: [
        { label: a, value: num(first?.totalCost) },
        { label: b, value: num(second?.totalCost) },
      ],
      table: {
        columns: [
          { key: "metric", label: "Metric" },
          { key: a, label: a },
          { key: b, label: b },
          { key: "variance", label: "Variance" },
          { key: "variancePct", label: "Variance %" },
        ],
        rows,
      },
    };
    return { [AUTO_REPORT_KEY]: report, output: { periodA: a, periodB: b, rows } };
  },
};

const subcontractorFullReport: HelpTool = {
  name: "subcontractor_full_report",
  description:
    "Relatório de um subcontractor cruzado com projetos, em seções: visão geral, projetos em que atuou (com status e custo) e lançamentos de custo. Use subcontractorId ou subcontractorName.",
  readOnly: true,
  requiredPermissions: ["Subcontractors"],
  parameters: {
    type: "object",
    properties: { subcontractorId: { type: "string" }, subcontractorName: { type: "string" }, ...PERIOD_PROPS, limit: { type: "number" } },
  },
  async run(args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const who: Record<string, unknown> = {};
    if (typeof args.subcontractorId === "string") who.subcontractorId = args.subcontractorId;
    else if (typeof args.subcontractorName === "string") who.subcontractorName = args.subcontractorName;
    else return { error: "subcontractorId or subcontractorName is required" };
    const scope = { ...who, ...periodArg(args), limit: Math.min(Math.max(Number(args.limit) || 40, 1), 100) };
    const { outputs, sections } = await runQueries(
      [
        { key: "details", tool: "get_subcontractor_details", args: scope },
        { key: "projects", tool: "subcontractor_projects", args: scope },
        { key: "entries", tool: "subcontractor_cost_entries", args: scope },
      ],
      ctx.companyId
    );
    if (!sections.length) return { error: "no data for this subcontractor" };
    const name = outputs.details?.subcontractor?.name ?? who.subcontractorName ?? "Subcontractor";
    return wrap({ title: `Subcontractor Report - ${name}`, sections }, outputs);
  },
};

const estimatesVsActual: HelpTool = {
  name: "estimates_vs_actual",
  description:
    "Orçado vs realizado: compara valor vendido, último estimate, faturado e custo de TODOS os projetos que casam com o filtro (padrão: projetos ativos; até 500) em uma tabela, ordenada pelo maior estouro de orçamento, com linha de total. projectIds/search/status filtram; limit só para 'os N piores'.",
  readOnly: true,
  requiredPermissions: PROJECT_FINANCE,
  requiresFullProjectAccess: true,
  projectScoped: true,
  parameters: {
    type: "object",
    properties: {
      projectIds: { type: "array", items: { type: "string" } },
      search: { type: "string" },
      status: { type: "array", items: { type: "string" } },
      limit: { type: "number", description: "Só para 'os N piores'. Sem isso, traz todos." },
    },
  },
  async run(args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const companyId = ctx.companyId;
    const { total, projects } = await resolveProjects(args, companyId, ctx);
    if (!projects.length) return { error: "no projects found", total: 0 };

    const entries = (
      await mapPool(projects, POOL_SIZE, async (project) => {
        try {
          const o = await runLegacyQuery("project_vs_estimate", { projectId: project.id }, companyId);
          const estimate = o?.latestEstimate ? num(o.latestEstimate.totalAmount) : null;
          const cost = num(o?.costs?.totalCost);
          const overrun = estimate === null ? Number.NEGATIVE_INFINITY : cost - estimate;
          const row: Record<string, Cell> = {
            address: project.location,
            client: project.client?.name ?? null,
            status: project.status_project,
            estimate: estimate === null ? null : usd(estimate),
            invoiced: usd(num(o?.invoiced)),
            cost: usd(cost),
            soldVsCost: usd(num(o?.deltas?.soldVsCost)),
            estimateVsCost: estimate === null ? null : usd(estimate - cost),
            overBudget: estimate === null ? null : cost > estimate ? "Yes" : "No",
          };
          return { row, overrun, estimate, invoiced: num(o?.invoiced), cost, soldVsCost: num(o?.deltas?.soldVsCost) };
        } catch (error) {
          console.error("[HelpAssistant] estimates_vs_actual failed:", error);
          return null;
        }
      })
    ).filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    if (!entries.length) return { error: "no data" };

    // Maior estouro primeiro; projetos sem estimate vão para o fim.
    entries.sort((a, b) => b.overrun - a.overrun);
    const limit = Number(args.limit) > 0 ? Math.min(Number(args.limit), MAX_PROJECTS) : entries.length;
    const shown = entries.slice(0, limit);

    const overBudget = shown.filter((entry) => entry.row.overBudget === "Yes");
    const withEstimate = shown.filter((entry) => entry.estimate !== null);
    const sum = (list: typeof shown, pick: (entry: (typeof shown)[number]) => number) => list.reduce((acc, entry) => acc + pick(entry), 0);
    const totalRow: Record<string, Cell> = {
      address: `TOTAL (${shown.length} projects)`,
      client: null,
      status: null,
      estimate: usd(sum(withEstimate, (e) => e.estimate ?? 0)),
      invoiced: usd(sum(shown, (e) => e.invoiced)),
      cost: usd(sum(shown, (e) => e.cost)),
      soldVsCost: usd(sum(shown, (e) => e.soldVsCost)),
      estimateVsCost: usd(sum(withEstimate, (e) => (e.estimate ?? 0) - e.cost)),
      overBudget: `${overBudget.length} over`,
    };

    const report: HelpReport = {
      title: "Estimate vs Actual",
      description: `${shown.length} of ${total} projects - ${withEstimate.length} with estimate - worst overrun first`,
      metrics: [
        { label: "Over budget", value: `${overBudget.length} of ${withEstimate.length}`, tone: overBudget.length ? "warning" : "success" },
        { label: "Estimated (projects with estimate)", value: String(totalRow.estimate) },
        { label: "Actual cost (all)", value: String(totalRow.cost) },
        { label: "No estimate", value: String(shown.length - withEstimate.length) },
      ],
      table: {
        columns: [
          { key: "address", label: "Project" },
          { key: "client", label: "Client" },
          { key: "status", label: "Status" },
          { key: "estimate", label: "Estimate" },
          { key: "invoiced", label: "Invoiced" },
          { key: "cost", label: "Actual cost" },
          { key: "soldVsCost", label: "Sold vs cost" },
          { key: "estimateVsCost", label: "Estimate vs cost" },
          { key: "overBudget", label: "Over budget" },
        ],
        rows: [...shown.map((entry) => entry.row), totalRow],
      },
    };
    return {
      [AUTO_REPORT_KEY]: report,
      output: {
        totalMatching: total,
        compared: shown.length,
        withEstimate: withEstimate.length,
        overBudgetCount: overBudget.length,
        totals: totalRow,
        worst: overBudget.slice(0, 10).map((entry) => entry.row),
        note: "A tabela completa (todos os projetos, com linha de total) foi anexada ao relatório; cite só os destaques. Projetos sem estimate não entram na comparação de orçamento.",
      },
    };
  },
};

export const laborAndSubsSkill: HelpSkill = {
  id: "labor-subs-estimates",
  description: "Mão de obra por período, subcontractors cruzados com projetos e orçado vs realizado.",
  instructions: `
- Mão de obra / folha / time cards num período: labor_period_report (relatório em seções) ou labor_period_comparison (período A vs B, ex.: este mês vs mês passado). "Folha" = custo de mão de obra pelos time cards.
- Subcontractor com seus projetos e custos: subcontractor_full_report.
- Orçado vs realizado de vários projetos: estimates_vs_actual (para um projeto só, project_vs_estimate também serve).
Relatórios e tabelas são anexados automaticamente com botões Excel e PDF; responda com os destaques e variações principais.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [laborReport, laborComparison, subcontractorFullReport, estimatesVsActual],
};
