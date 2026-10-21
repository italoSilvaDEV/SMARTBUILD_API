import { AIAssistantController } from "../../controllers/aiAssistant/AIAssistantController";
import { prisma } from "../../utils/prisma";
import { HelpSkill, HelpTool } from "../types";
import { summarizeInvoices } from "./receivables";

/**
 * Ponte para as consultas do IA Assistant antigo (/ai-assistant).
 *
 * Todas essas consultas são somente leitura. Elas são usadas como estão,
 * sem alterar o módulo antigo, acessando `getTools`/`executeTool` (privados
 * só em tempo de compilação). Quando o assistente antigo for aposentado,
 * mover essas consultas para dentro de helpAssistant/ e remover esta ponte.
 */
const legacy = new AIAssistantController() as unknown as {
  getTools(): { name: string; description: string; parameters: Record<string, unknown> }[];
  executeTool(toolName: string, rawArgs: string, companyId: string, history: unknown[], question: string): Promise<{ output: unknown }>;
};

const MAX_OUTPUT_CHARS = 14000;

const PROJECTS = ["Projects"];
const PROJECT_FINANCE = ["Projects", "Invoice"];

/**
 * Permissões exigidas por consulta. Consulta que não está aqui não é
 * exposta (falha fechada), então novas tools do módulo antigo precisam
 * ser classificadas antes de aparecer no assistente.
 */
const TOOL_ACCESS: Record<string, { permissions: string[]; fullProjectAccess?: boolean }> = {
  list_projects: { permissions: PROJECTS, fullProjectAccess: true },
  get_project_details: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  project_status_transitions: { permissions: PROJECTS, fullProjectAccess: true },
  project_schedule_risk: { permissions: PROJECTS, fullProjectAccess: true },
  project_services_detail: { permissions: PROJECTS, fullProjectAccess: true },
  project_files_detail: { permissions: PROJECTS, fullProjectAccess: true },
  project_tasks_detail: { permissions: PROJECTS, fullProjectAccess: true },
  project_feed_detail: { permissions: PROJECTS, fullProjectAccess: true },
  project_team_detail: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  project_cost_breakdown: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  project_margin_analysis: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  project_invoices_detail: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  project_change_orders_detail: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  project_vs_estimate: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  top_spending_projects: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  top_profitable_projects: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  change_order_summary: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  list_clients: { permissions: ["Clients"] },
  get_client_details: { permissions: ["Clients", "Invoice"] },
  list_invoices: { permissions: ["Invoice"] },
  financial_period_comparison: { permissions: PROJECT_FINANCE, fullProjectAccess: true },
  // Fora de propósito: as consultas de faturas/recebíveis do módulo antigo tratam
  // faturas void como em aberto. invoice_summary, overdue_invoices, invoice_aging,
  // receivables_by_client, cashflow_projection e client_risk_analysis foram
  // reescritas em receivables.ts; company_overview está logo abaixo.
  estimate_summary: { permissions: ["Estimates"] },
  timecard_summary: { permissions: ["Time Cards"] },
  timecards_by_worker: { permissions: ["Time Cards"] },
  worker_timecard_details: { permissions: ["Time Cards"] },
  timecards_by_project: { permissions: ["Time Cards"] },
  timecards_daily_breakdown: { permissions: ["Time Cards"] },
  employee_vs_subcontractor_spend: { permissions: ["Time Cards", "Subcontractors"] },
  subcontractor_summary: { permissions: ["Subcontractors"] },
  list_subcontractors: { permissions: ["Subcontractors"] },
  get_subcontractor_details: { permissions: ["Subcontractors"] },
  subcontractor_projects: { permissions: ["Subcontractors"] },
  subcontractor_cost_entries: { permissions: ["Subcontractors"] },
};

const PENDING_STATUSES = new Set(["open", "draft", "partial"]);

/**
 * Corrige totais de consultas antigas que tratam qualquer status diferente
 * de "paid" como em aberto (incluindo void/uncollectible).
 */
function fixLegacyOutput(toolName: string, output: any): unknown {
  if (!output || typeof output !== "object") return output;

  if (toolName === "project_invoices_detail" && Array.isArray(output.items)) {
    const now = Date.now();
    const items = output.items.map((item: any) => ({
      ...item,
      isOverdue: PENDING_STATUSES.has(item.status) && item.dueDate ? new Date(item.dueDate).getTime() < now : false,
    }));
    const due = (item: any) => (item.balanceRemaining ? item.balanceRemaining : item.totalAmount) || 0;
    const valid = items.filter((item: any) => item.status !== "void");
    return {
      ...output,
      items,
      totals: {
        invoiceCount: valid.length,
        totalInvoiced: valid.reduce((acc: number, item: any) => acc + (item.totalAmount || 0), 0),
        paidAmount: items.filter((item: any) => item.status === "paid").reduce((acc: number, item: any) => acc + (item.totalAmount || 0), 0),
        openAmount: items.filter((item: any) => PENDING_STATUSES.has(item.status)).reduce((acc: number, item: any) => acc + due(item), 0),
        overdueAmount: items.filter((item: any) => item.isOverdue).reduce((acc: number, item: any) => acc + due(item), 0),
      },
    };
  }

  if (toolName === "get_client_details" && output.financials) {
    // overdueCount/invoicedAmount antigos incluem faturas canceladas; use receivables_by_client.
    const { overdueCount, invoicedAmount, ...financials } = output.financials;
    return { ...output, financials };
  }

  return output;
}

const MONEY_KEY = /(amount|cost|price|value|profit|revenue|invoiced|paid|balance|spend|pay|due)$/i;
const NOT_MONEY_KEY = /(percent|pct|percentage|rate|hours|count|qty|quantity|days|id)$/i;
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Acrescenta `<campo>Usd` com o valor já formatado a cada campo monetário,
 * para o modelo copiar o texto em vez de reescrever (e reescalar) números.
 */
function annotateMoney(value: any, depth = 0): any {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => annotateMoney(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    result[key] = annotateMoney(field, depth + 1);
    if (typeof field === "number" && MONEY_KEY.test(key) && !NOT_MONEY_KEY.test(key)) {
      result[`${key}Usd`] = USD.format(field);
    }
  }
  return result;
}

function truncateOutput(output: unknown): unknown {
  const json = JSON.stringify(output ?? null);
  if (json.length <= MAX_OUTPUT_CHARS) return output;
  return { truncated: true, partialJson: json.slice(0, MAX_OUTPUT_CHARS) };
}

const dataTools: HelpTool[] = legacy
  .getTools()
  .filter((tool) => TOOL_ACCESS[tool.name])
  .map((tool) => {
    const access = TOOL_ACCESS[tool.name];
    return {
      name: tool.name,
      description: tool.description,
      readOnly: true as const,
      parameters: tool.parameters,
      requiredPermissions: access.permissions,
      requiresFullProjectAccess: access.fullProjectAccess,
      async run(args, ctx) {
        if (!ctx.companyId) return { error: "no active company" };
        const result = await legacy.executeTool(tool.name, JSON.stringify(args ?? {}), ctx.companyId, [], "");
        return truncateOutput(annotateMoney(fixLegacyOutput(tool.name, result?.output)));
      },
    };
  });

const ACTIVE_PROJECT_STATUSES = ["Pre-Start", "In Progress", "Final walkthrough"];

const companyOverviewTool: HelpTool = {
  name: "company_overview",
  description:
    "Visão geral da empresa: projetos ativos, clientes, totais de faturas (faturado, recebido, em aberto e vencido) e os 3 projetos com maior gasto.",
  readOnly: true,
  parameters: { type: "object", properties: {} },
  requiredPermissions: PROJECT_FINANCE,
  requiresFullProjectAccess: true,
  async run(_args, ctx) {
    if (!ctx.companyId) return { error: "no active company" };
    const [activeProjects, totalProjects, clients, invoices, topSpending] = await Promise.all([
      prisma.project.count({ where: { company_id: ctx.companyId, status_project: { in: ACTIVE_PROJECT_STATUSES } } }),
      prisma.project.count({ where: { company_id: ctx.companyId } }),
      prisma.client.count({ where: { company_id: ctx.companyId } }),
      summarizeInvoices(ctx.companyId),
      legacy.executeTool("top_spending_projects", JSON.stringify({ limit: 3 }), ctx.companyId, [], ""),
    ]);
    return annotateMoney({
      activeProjects,
      totalProjects,
      clients,
      invoices,
      topSpendingProjects: (topSpending?.output as any)?.items ?? [],
    });
  },
};

export const companyDataSkill: HelpSkill = {
  id: "company-data",
  description: "Consulta (somente leitura) projetos, clientes, faturas, orçamentos, time cards e subcontractors da empresa ativa.",
  instructions: `
Você tem ferramentas de consulta aos dados reais da empresa ativa do usuário. Elas são somente leitura.
- Para perguntas sobre números, rankings, listas, comparações, projetos, clientes, faturas, orçamentos, time cards ou subcontractors da empresa, USE as ferramentas. Nunca invente valores.
- Combine várias ferramentas quando necessário e cite números específicos.
- Para valores em dinheiro, copie exatamente os campos terminados em "Usd" (ex.: "$10,000,094.50"). Nunca reescreva nem reescale números.
- Projetos ativos são apenas Pre-Start, In Progress e Final walkthrough.
- Ao mencionar um projeto, inclua endereço e cliente quando disponíveis. Não use o nome do cliente como nome do projeto.
- Custo de funcionários vem dos time cards; custo de subcontractors vem dos lançamentos de subcontractor. Mantenha separados, salvo pedido explícito.
- "Quem ganha mais" significa pagamento/custo de mão de obra pelos time cards (não há folha de pagamento separada).
- Converta períodos relativos nos argumentos: "este mês" → period="thisMonth", "mês passado" → "lastMonth", "esta semana" → "thisWeek", "semana passada" → "lastWeek", "últimos 30 dias" → "last30Days", "este ano" → "thisYear".
- Para comparar períodos, prefira financial_period_comparison.
- Só existem as ferramentas que você recebeu. Se o usuário pedir um dado para o qual você não tem ferramenta, diga que o perfil dele não tem acesso a essa informação pelo assistente e indique a tela do sistema.
`.trim(),
  isAvailable: (ctx) => Boolean(ctx.companyId),
  tools: [...dataTools, companyOverviewTool],
};
