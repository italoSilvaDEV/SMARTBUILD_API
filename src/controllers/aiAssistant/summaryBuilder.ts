import { compactValue, getCompactReport } from "./reportUtils";
import { formatCurrency, formatHours } from "./utils";
import type { AssistantReport, AssistantStructuredResponse, ExecutedTool } from "./types";

type BuildReportFromTool = (tool: ExecutedTool) => AssistantReport | null;

function shouldUsePtBr(question = "") {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return /\b(qual|quais|quero|me mostre|mostra|liste|lista|desse|deste|esse|esta|mes|semana|projeto|cliente|fatura|custo|lucro|margem|trabalhador|trabalhadores|funcionario|funcionarios)\b/.test(normalized);
}

function textFor(question: string | undefined, pt: string, en: string) {
  return shouldUsePtBr(question) ? pt : en;
}

const DIRECT_SUMMARY_TOOL_SET = new Set([
  "list_projects",
  "list_clients",
  "list_invoices",
  "invoice_summary",
  "invoice_aging",
  "overdue_invoices",
  "receivables_by_client",
  "client_risk_analysis",
  "cashflow_projection",
  "top_spending_projects",
  "top_profitable_projects",
  "estimate_summary",
  "change_order_summary",
  "timecards_by_worker",
  "timecards_by_project",
  "timecard_summary",
  "worker_timecard_details",
  "subcontractor_summary",
  "subcontractor_projects",
  "subcontractor_cost_entries",
  "financial_period_comparison",
]);

export function shouldPreferDirectToolSummary(tools: ExecutedTool[], buildReportFromTool: BuildReportFromTool) {
  if (tools.length !== 1) return false;
  const [tool] = tools;
  if (!DIRECT_SUMMARY_TOOL_SET.has(tool.tool)) return false;
  const report = buildReportFromTool(tool);
  return Boolean(report?.table?.rows?.length || report?.chartData?.length);
}

export function compactToolOutputForModel(tool: ExecutedTool, buildReportFromTool: BuildReportFromTool) {
  const fallback = buildToolSummaryResponse([tool], buildReportFromTool);
  const report = getCompactReport(buildReportFromTool(tool) || fallback.report || null);

  return {
    tool: tool.tool,
    input: compactValue(tool.input),
    output: compactValue(tool.output),
    summary: {
      content: fallback.content,
      bullets: (fallback.bullets || []).slice(0, 4),
      followUp: fallback.followUp || null,
    },
    report,
  };
}

export function buildToolSummaryResponse(
  tools: ExecutedTool[],
  buildReportFromTool: BuildReportFromTool,
  question = ""
): AssistantStructuredResponse {
  const latestTool = tools[tools.length - 1];
  const base = latestTool?.output as any;

  if (latestTool?.tool === "project_status_transitions" && base?.missingStatusChangeDateSupport) {
    return {
      content: "SmartBuild does not have stored project status change dates available for this query yet.",
      bullets: [
        "A reliable monthly or weekly count of projects moving into a status requires the stored status change date.",
        "Without that field populated, I should not infer transitions from generic update dates, deadlines, or start dates.",
      ],
      followUp: "Once status change dates are being stored, I can count how many projects moved into any status over any period.",
      report: null,
    };
  }

  if (latestTool?.tool === "top_spending_projects" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: textFor(
        question,
        `${topProject.projectName} é atualmente o projeto com maior gasto no período selecionado para ${topProject.clientName || "este cliente"}.`,
        `${topProject.projectName} is currently the highest-spending project in the selected period for ${topProject.clientName || "this client"}.`
      ),
      bullets: [
        textFor(question, `Endereço do projeto: ${topProject.projectAddress || topProject.projectName}.`, `Project address: ${topProject.projectAddress || topProject.projectName}.`),
        textFor(question, `Custo total estimado: ${formatCurrency(topProject.totalCost || 0)}.`, `Estimated total cost: ${formatCurrency(topProject.totalCost || 0)}.`),
        textFor(question, `${base.items.length} projetos foram avaliados neste ranking.`, `${base.items.length} projects were evaluated for this ranking.`),
      ],
      followUp: textFor(question, "Posso quebrar isso por materiais, mão de obra e impacto de invoices, ou mostrar o ranking completo em tabela.", "I can break this down by materials, labor and invoice impact, or show the full ranked list in a table."),
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "list_projects" && base?.items?.length) {
    return {
      content: textFor(question, `Encontrei ${base.total || base.items.length} projetos ativos.`, `I found ${base.total || base.items.length} active projects.`),
      bullets: [
        textFor(question, `A tabela segue a estrutura de Seller Projects: número, cliente, endereço e valor.`, `The table follows the Seller Projects structure: number, client, address and value.`),
        textFor(question, `${base.returnedCount || base.items.length} projetos estão carregados nesta resposta.`, `${base.returnedCount || base.items.length} projects are loaded in this response.`),
        textFor(question, `Posso refinar essa lista por status, cliente, número de contrato, lucratividade ou maior custo.`, `I can narrow this list by status, client, contract number, profitability or highest cost.`),
      ],
      followUp: textFor(question, "Se quiser, posso ordenar por maior valor, maior custo, melhor margem ou filtrar por um único status.", "If you want, I can sort this by highest value, highest cost, best margin, or filter to one status only."),
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "top_profitable_projects" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: textFor(
        question,
        `${topProject.projectName} é atualmente o projeto mais lucrativo para ${topProject.clientName || "este cliente"}.`,
        `${topProject.projectName} is currently the most profitable project for ${topProject.clientName || "this client"}.`
      ),
      bullets: [
        textFor(question, `Endereço do projeto: ${topProject.projectAddress || topProject.projectName}.`, `Project address: ${topProject.projectAddress || topProject.projectName}.`),
        textFor(question, `Valor vendido: ${formatCurrency(topProject.soldValue || 0)}.`, `Sold value: ${formatCurrency(topProject.soldValue || 0)}.`),
        textFor(question, `Custo de material: ${formatCurrency(topProject.materialCost || 0)} e custo de mão de obra: ${formatCurrency(topProject.laborCost || 0)}.`, `Material cost: ${formatCurrency(topProject.materialCost || 0)} and labor cost: ${formatCurrency(topProject.laborCost || 0)}.`),
        textFor(question, `Lucro: ${formatCurrency(topProject.profitValue || 0)} (${((topProject.profitPct || 0) * 100).toFixed(1)}%).`, `Profit: ${formatCurrency(topProject.profitValue || 0)} (${((topProject.profitPct || 0) * 100).toFixed(1)}%).`),
      ],
      followUp: textFor(question, "Posso detalhar por que esse projeto está performando melhor que os outros, ou mostrar o ranking completo em tabela.", "I can break down why this project is outperforming the rest, or show the full ranked list in a table."),
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "get_project_details" && base?.id) {
    return {
      content: `${base.projectAddress || base.projectName} for ${base.clientName || "this client"} is ${String(base.status || "active").toLowerCase()} with ${formatCurrency(base.price || 0)} in sold value.`,
      bullets: [
        `Total cost: ${formatCurrency(base.financials?.totalCost || 0)} with ${formatCurrency(base.financials?.materialCost || 0)} in materials and ${formatCurrency(base.financials?.laborCost || 0)} in labor.`,
        `Invoices: ${base.invoices?.length || 0} totaling ${formatCurrency(base.financials?.invoicedAmount || 0)}.`,
        `Scope: ${base.services?.length || 0} services, ${base.counts?.tasks || 0} tasks, ${base.counts?.changeOrders || 0} change orders and ${base.counts?.files || 0} files.`,
      ],
      followUp: "I can open services, team, feed, files, invoices, tasks or change orders for this project.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_status_transitions" && base?.items?.length) {
    const firstProject = base.items[0];
    return {
      content: `${base.total || base.items.length} projects moved into the requested status during the selected period.`,
      bullets: [
        `Latest project in the result: ${firstProject.projectAddress || firstProject.projectName} for ${firstProject.clientName || "this client"}.`,
        `Current status: ${firstProject.status || "Not available"}.`,
        `Status changed on: ${firstProject.statusChangedAt ? String(firstProject.statusChangedAt).slice(0, 10) : "Not available"}.`,
      ],
      followUp: "I can show the full table, narrow this by another status, or compare one month against another.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_cost_breakdown" && base?.totals) {
    return {
      content: `${base.projectAddress || base.projectName} is currently carrying ${formatCurrency(base.totals.totalCost || 0)} in total cost.`,
      bullets: [
        `Material cost: ${formatCurrency(base.totals.materialCost || 0)}.`,
        `Internal labor: ${formatCurrency(base.totals.internalLaborCost || 0)} and subcontractors: ${formatCurrency(base.totals.subcontractorCost || 0)}.`,
        `${base.topMaterials?.length || 0} top material groups are available in this breakdown.`,
      ],
      followUp: "I can go line by line through materials, labor contributors, or subcontractor entries.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_margin_analysis" && base?.margin) {
    return {
      content: `${base.projectAddress || base.projectName} currently shows a margin of ${formatCurrency(base.margin.value || 0)} (${((base.margin.percentage || 0) * 100).toFixed(1)}%).`,
      bullets: [
        `Sold value: ${formatCurrency(base.soldValue || 0)}.`,
        `Total cost: ${formatCurrency(base.costs?.totalCost || 0)} and invoiced amount: ${formatCurrency(base.invoiced || 0)}.`,
        `Amount paid: ${formatCurrency(base.amountPaid || 0)} with ${formatCurrency(base.balanceDue || 0)} still due.`,
      ],
      followUp: "I can explain the drivers of this margin through services, labor, materials and invoices.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_schedule_risk" && base?.projectId) {
    return {
      content: `${base.projectAddress || base.projectName} is currently at ${base.riskLevel || "low"} schedule risk.`,
      bullets: [
        `Risk score: ${base.riskScore || 0}.`,
        `${base.stalledServices || 0} stalled services and ${base.openTasks || 0} open tasks are contributing to risk.`,
        `Days to deadline: ${base.daysToDeadline == null ? "N/A" : base.daysToDeadline}.`,
      ],
      followUp: "I can open the underlying services and tasks driving this schedule risk.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_services_detail" && base?.services?.length) {
    return {
      content: `${base.projectAddress || base.projectName} has ${base.totalServices || base.services.length} services in scope.`,
      bullets: [
        `Planned value: ${formatCurrency(base.totals?.plannedValue || 0)} across ${formatHours(base.totals?.plannedHours || 0)} planned hours.`,
        `Material cost tracked in service cost items: ${formatCurrency(base.totals?.materialCost || 0)}.`,
        `Activities: ${base.totals?.activityCount || 0}, photos: ${base.totals?.photoCount || 0}, tasks: ${base.totals?.taskCount || 0}.`,
      ],
      followUp: "I can break down any specific service, subservice, stage or material group.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_files_detail" && base?.totals) {
    return {
      content: `${base.projectAddress || base.projectName} has ${base.totals.files || 0} project files organized across ${base.totals.folders || 0} folders.`,
      bullets: [
        `Root files: ${base.totals.rootFiles || 0}.`,
        `Contract files: ${base.totals.contractFiles || 0}.`,
        `I can list specific folders or files if you want a narrower slice.`,
      ],
      followUp: "Ask for the latest files, contract documents, or files inside a specific folder.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_tasks_detail" && base?.items?.length) {
    return {
      content: `${base.projectAddress || base.projectName} currently has ${base.totals?.totalTasks || 0} tracked tasks.`,
      bullets: [
        `Open: ${base.totals?.open || 0}, in progress: ${base.totals?.inProgress || 0}, completed: ${base.totals?.completed || 0}.`,
        `Urgent: ${base.totals?.urgent || 0} and overdue: ${base.totals?.overdue || 0}.`,
        `The full task list includes owner, due date, service, comments and files.`,
      ],
      followUp: "I can surface only overdue tasks, urgent tasks, or tasks for one service.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_feed_detail" && base?.totals) {
    return {
      content: `${base.projectAddress || base.projectName} has ${base.totals?.activities || 0} feed activities and ${base.totals?.photos || 0} photos in the current project feed.`,
      bullets: [
        `Services publishing feed content: ${base.totals?.services || 0}.`,
        `Latest activities include author, service, likes and comments.`,
      ],
      followUp: "I can show the latest posts, most active services, or photo-heavy areas of the project.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_invoices_detail" && base?.items?.length) {
    return {
      content: `${base.projectAddress || base.projectName} has ${base.totals?.invoiceCount || 0} invoices totaling ${formatCurrency(base.totals?.totalInvoiced || 0)}.`,
      bullets: [
        `Paid: ${formatCurrency(base.totals?.paidAmount || 0)}.`,
        `Open: ${formatCurrency(base.totals?.openAmount || 0)} with ${formatCurrency(base.totals?.overdueAmount || 0)} overdue.`,
        `Sold value is ${formatCurrency(base.soldValue || 0)} and current balance due is ${formatCurrency(base.balanceDue || 0)}.`,
      ],
      followUp: "I can identify the overdue invoices or compare invoicing against project cost and margin.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_change_orders_detail" && base?.items?.length) {
    return {
      content: `${base.projectAddress || base.projectName} has ${base.totals?.count || 0} change orders totaling ${formatCurrency(base.totals?.totalAmount || 0)}.`,
      bullets: [
        `Approved amount: ${formatCurrency(base.totals?.approvedAmount || 0)}.`,
        `Pending amount: ${formatCurrency(base.totals?.pendingAmount || 0)}.`,
        `Each change order includes scope, supervisor and line items.`,
      ],
      followUp: "I can show the pending change orders or list the services inside one change order.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_team_detail" && base?.totals) {
    return {
      content: `${base.projectAddress || base.projectName} currently shows ${formatCurrency((base.totals?.employeeLaborCost || 0) + (base.totals?.subcontractorCost || 0))} in team cost.`,
      bullets: [
        `Employee labor: ${formatCurrency(base.totals?.employeeLaborCost || 0)} across ${base.totals?.employeeCount || 0} employees.`,
        `Subcontractors: ${formatCurrency(base.totals?.subcontractorCost || 0)} across ${base.totals?.subcontractorCount || 0} subcontractors.`,
        `Total hours captured: ${formatHours(base.totals?.totalHours || 0)} across ${base.totals?.totalEntries || 0} entries.`,
      ],
      followUp: "I can rank the most expensive employee, the most expensive subcontractor, or show team cost by date.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "get_client_details" && base?.id) {
    return {
      content: `${base.name} currently has ${base.financials?.projectCount || 0} active projects and ${formatCurrency(base.financials?.invoicedAmount || 0)} in invoiced volume.`,
      bullets: [
        `Invoices on record: ${base.financials?.invoiceCount || 0}.`,
        `Overdue invoices: ${base.financials?.overdueCount || 0}.`,
        `Address: ${base.address || base.cityAndState || "Not available"}.`,
      ],
      followUp: "I can break this client down by projects, receivables, overdue invoices, or payment risk.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "invoice_summary" && base?.totals) {
    return {
      content: `The selected invoice set totals ${formatCurrency(base.totals.total || 0)}, with ${formatCurrency(base.totals.open || 0)} still open.`,
      bullets: [
        `Paid amount: ${formatCurrency(base.totals.paid || 0)}.`,
        `Overdue exposure: ${formatCurrency(base.totals.overdue || 0)}.`,
        `Invoices in scope: ${base.totalCount || 0}.`,
      ],
      followUp: "I can show the underlying invoices, isolate only overdue items, or break receivables down by client.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "estimate_summary" && base?.items?.length) {
    return {
      content: `The selected estimates total ${formatCurrency(base.totals?.amount || 0)}, with ${formatCurrency(base.totals?.balance || 0)} still outstanding.`,
      bullets: [
        `Paid against these estimates: ${formatCurrency(base.totals?.paid || 0)}.`,
        `Estimate count: ${base.total || base.items.length}.`,
        `Top estimate project: ${base.items[0].projectAddress || base.items[0].projectName || "Not available"}.`,
      ],
      followUp: "I can compare any one of these projects against cost, invoicing, or approved change orders.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "project_vs_estimate" && base?.projectId) {
    return {
      content: `${base.projectAddress || base.projectName} is currently ${formatCurrency(base.deltas?.soldVsCost || 0)} above cost versus sold value.`,
      bullets: [
        `Sold value: ${formatCurrency(base.soldValue || 0)}.`,
        `Latest estimate: ${base.latestEstimate ? formatCurrency(base.latestEstimate.totalAmount || 0) : "Not available"}.`,
        `Total project cost: ${formatCurrency(base.costs?.totalCost || 0)} and invoiced amount: ${formatCurrency(base.invoiced || 0)}.`,
      ],
      followUp: "I can explain whether the gap is coming from materials, labor, change orders, or invoicing pace.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "change_order_summary" && base?.items?.length) {
    return {
      content: `There are ${base.total || base.items.length} change orders in scope, with ${formatCurrency(base.totals?.approved || 0)} approved and ${formatCurrency(base.totals?.pending || 0)} still pending.`,
      bullets: [
        `Canceled value: ${formatCurrency(base.totals?.canceled || 0)}.`,
        `Latest project in scope: ${base.items[0].projectAddress || base.items[0].projectName || "Not available"}.`,
        `Latest client in scope: ${base.items[0].client?.name || "Not available"}.`,
      ],
      followUp: "I can open the pending change orders, group them by project, or compare them against estimate and margin.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "timecards_by_worker" && base?.items?.length) {
    const topWorker = base.items[0];
    return {
      content: textFor(
        question,
        `${topWorker.workerName} é atualmente o funcionário com maior custo de mão de obra em ${base.periodLabel || "o período selecionado"}, com base nos time cards do SmartBuild.`,
        `${topWorker.workerName} is currently the highest labor cost employee for ${base.periodLabel || "the selected period"} based on SmartBuild time cards.`
      ),
      bullets: [
        textFor(question, `Filtro de data usado: ${base.dateRangeLabel || base.periodLabel || "o período selecionado"}.`, `Date filter used: ${base.dateRangeLabel || base.periodLabel || "the selected period"}.`),
        textFor(question, `Custo total de mão de obra: ${formatCurrency(topWorker.totalCost || 0)}.`, `Total labor cost: ${formatCurrency(topWorker.totalCost || 0)}.`),
        textFor(question, `Total de horas registradas: ${formatHours(topWorker.totalHours || 0)} em ${topWorker.entryCount || 0} lançamentos, incluindo ${formatHours(topWorker.regularHours || 0)} regulares e ${formatHours(topWorker.overtimeHours || 0)} extras.`, `Total logged hours: ${formatHours(topWorker.totalHours || 0)} across ${topWorker.entryCount || 0} entries, including ${formatHours(topWorker.regularHours || 0)} regular and ${formatHours(topWorker.overtimeHours || 0)} overtime.`),
        textFor(question, `Principal projeto: ${topWorker.topProjectAddress || topWorker.topProjectName || "Não disponível"} para ${topWorker.topProjectClientName || "o cliente registrado"}.`, `Main project: ${topWorker.topProjectAddress || topWorker.topProjectName || "Not available"} for ${topWorker.topProjectClientName || "the client on record"}.`),
        textFor(question, `Este ranking usa custo de mão de obra dos time cards, não salário de RH.`, `This ranking is based on time-card labor pay/cost, not HR salary records.`),
      ],
      followUp: textFor(question, "Posso quebrar esse trabalhador por projeto ou por data específica.", "I can break this worker down by project or by specific date."),
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "worker_timecard_details" && base?.entries?.length) {
    return {
      content: textFor(question, `${base.workerName} tem ${base.totalEntries || 0} lançamentos de time card para ${base.periodLabel || "o período selecionado"}.`, `${base.workerName} has ${base.totalEntries || 0} time card entries for ${base.periodLabel || "the selected period"}.`),
      bullets: [
        textFor(question, `Filtro de data usado: ${base.dateRangeLabel || base.periodLabel || "o período selecionado"}.`, `Date filter used: ${base.dateRangeLabel || base.periodLabel || "the selected period"}.`),
        textFor(question, `Custo total de mão de obra: ${formatCurrency(base.totalCost || 0)} com base nos time cards do SmartBuild.`, `Total labor cost: ${formatCurrency(base.totalCost || 0)} based on SmartBuild time cards.`),
        textFor(question, `Total de horas: ${formatHours(base.totalHours || 0)}.`, `Total hours: ${formatHours(base.totalHours || 0)}.`),
        textFor(question, `Projeto mais recente: ${base.entries[0].projectAddress || base.entries[0].projectName || "Não disponível"} para ${base.entries[0].clientName || "o cliente registrado"}.`, `Most recent project: ${base.entries[0].projectAddress || base.entries[0].projectName || "Not available"} for ${base.entries[0].clientName || "the recorded client"}.`),
        textFor(question, `Cada lançamento inclui check-in, check-out, serviço, categoria e custo calculado de mão de obra.`, `Each entry includes check-in, check-out, service, category and calculated labor pay.`),
      ],
      followUp: textFor(question, "Também posso comparar esse trabalhador com o restante da equipe na mesma semana.", "I can also compare this worker against the rest of the team for the same week."),
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "timecards_by_project" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: textFor(question, `${topProject.projectAddress || topProject.projectName} é atualmente o projeto com maior custo de mão de obra em ${base.periodLabel || "o período selecionado"}.`, `${topProject.projectAddress || topProject.projectName} currently has the highest labor cost for ${base.periodLabel || "the selected period"}.`),
      bullets: [
        textFor(question, `Filtro de data usado: ${base.dateRangeLabel || base.periodLabel || "o período selecionado"}.`, `Date filter used: ${base.dateRangeLabel || base.periodLabel || "the selected period"}.`),
        textFor(question, `Cliente: ${topProject.clientName || "Não disponível"}.`, `Client: ${topProject.clientName || "Not available"}.`),
        textFor(question, `Custo de mão de obra: ${formatCurrency(topProject.totalCost || 0)}.`, `Labor cost: ${formatCurrency(topProject.totalCost || 0)}.`),
        textFor(question, `Total de horas: ${formatHours(topProject.totalHours || 0)} em ${topProject.entryCount || 0} lançamentos.`, `Total hours: ${formatHours(topProject.totalHours || 0)} across ${topProject.entryCount || 0} entries.`),
      ],
      followUp: textFor(question, "Posso mostrar quais trabalhadores estão puxando o custo de mão de obra desse projeto.", "I can show which workers are driving the labor cost on this project."),
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "timecard_summary" && base?.byProject?.length) {
    return {
      content: `I summarized the available time cards for ${base.periodLabel || "the selected scope"}.`,
      bullets: [
        `Date filter used: ${base.dateRangeLabel || base.periodLabel || "the selected scope"}.`,
        `Total entries: ${base.totalEntries || 0}.`,
        `Total hours: ${formatHours(base.totalHours || 0)}.`,
        `Total labor cost: ${formatCurrency(base.totalCost || 0)}.`,
      ],
      followUp: "I can also rank workers, projects, or show one worker on a specific date.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "employee_vs_subcontractor_spend" && base?.totals) {
    return {
      content: `Total labor spend for ${base.periodLabel || "the selected period"} is ${formatCurrency(base.totals.totalCost || 0)}.`,
      bullets: [
        `Date filter used: ${base.dateRangeLabel || base.periodLabel || "the selected period"}.`,
        `Employees account for ${formatCurrency(base.totals.employeeCost || 0)} across ${base.employee?.totalEntries || 0} time-card entries.`,
        `Subcontractors account for ${formatCurrency(base.totals.subcontractorCost || 0)} across ${base.subcontractor?.totalEntries || 0} cost entries.`,
        `Combined project coverage: ${base.totals.projectCount || 0} active projects.`,
      ],
      followUp: "I can break this down by project, by worker, by subcontractor, or show the detailed tables behind each side.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "financial_period_comparison" && base?.rows?.length) {
    const totalCostRow = base.rows.find((row: any) => row.label === "Total Cost");
    const topVarianceRow = [...base.rows].sort((a: any, b: any) => Math.abs(b.variance || 0) - Math.abs(a.variance || 0))[0];

    return {
      content: textFor(
        question,
        `Comparei ${base.current?.dateRangeLabel || "o período atual"} com ${base.previous?.dateRangeLabel || "o período anterior"} e o custo total ficou em ${formatCurrency(base.current?.totalCost || 0)}.`,
        `I compared ${base.current?.dateRangeLabel || "the current period"} against ${base.previous?.dateRangeLabel || "the previous period"} and the total cost is ${formatCurrency(base.current?.totalCost || 0)}.`
      ),
      bullets: [
        textFor(question, `Período atual: ${base.current?.dateRangeLabel || "não informado"}.`, `Current period: ${base.current?.dateRangeLabel || "not provided"}.`),
        textFor(question, `Período anterior: ${base.previous?.dateRangeLabel || "não informado"}.`, `Previous period: ${base.previous?.dateRangeLabel || "not provided"}.`),
        totalCostRow
          ? textFor(
              question,
              `Variação do custo total: ${totalCostRow.variance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totalCostRow.variance || 0))} (${((totalCostRow.variancePct || 0) * 100).toFixed(1)}%).`,
              `Total cost variance: ${totalCostRow.variance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(totalCostRow.variance || 0))} (${((totalCostRow.variancePct || 0) * 100).toFixed(1)}%).`
            )
          : null,
        topVarianceRow
          ? textFor(
              question,
              `Maior mudança observada: ${topVarianceRow.label}.`,
              `Largest observed change: ${topVarianceRow.label}.`
            )
          : null,
      ].filter(Boolean) as string[],
      followUp: textFor(question, "Posso isolar só materiais, só mão de obra, só invoices ou comparar esse recorte por projeto.", "I can isolate just materials, just labor, just invoices, or compare this view by project."),
      report: buildReportFromTool(latestTool),
    };
  }

  if ((latestTool?.tool === "subcontractor_summary" || latestTool?.tool === "list_subcontractors") && base?.items?.length) {
    const topSubcontractor = base.items[0];
    return {
      content: `${topSubcontractor.name} is currently the highest-cost subcontractor in the selected scope.`,
      bullets: [
        `Total subcontractor cost: ${formatCurrency(topSubcontractor.totalCost || 0)} across ${topSubcontractor.projectCount || 0} projects.`,
        `Top project: ${topSubcontractor.topProjectAddress || topSubcontractor.topProjectName || "Not available"} for ${topSubcontractor.topProjectClientName || "this client"}.`,
        `Company-wide subcontractor spend in this result set: ${formatCurrency(base.totals?.totalSubcontractorCosts || 0)}.`,
      ],
      followUp: "I can open that subcontractor in detail and show every project, entry, payment date and category.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "get_subcontractor_details" && base?.subcontractor) {
    return {
      content: `${base.subcontractor.name} is linked to ${base.totals?.totalProjects || 0} projects with ${formatCurrency(base.totals?.totalCost || 0)} in subcontractor cost.`,
      bullets: [
        `Average cost per project: ${formatCurrency(base.totals?.averageCostPerProject || 0)}.`,
        `Entries available: ${base.totals?.totalEntries || 0}.`,
        `Current top project: ${base.projects?.[0]?.projectAddress || base.projects?.[0]?.projectName || "Not available"} for ${base.projects?.[0]?.clientName || "this client"}.`,
        `Latest payment activity: ${base.latestPaymentDate ? String(base.latestPaymentDate).slice(0, 10) : "Not available"}.`,
      ],
      followUp: "I can break this down by project, service/category, or show each cost entry line by line.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "subcontractor_projects" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: `${topProject.projectAddress || topProject.projectName} is currently the most expensive project for this subcontractor.`,
      bullets: [
        `Client: ${topProject.clientName || "Not available"}.`,
        `Subcontractor cost on this project: ${formatCurrency(topProject.totalCost || 0)}.`,
        `Project status: ${topProject.status || "Not available"} with ${topProject.entryCount || 0} cost entries.`,
      ],
      followUp: "I can show the detailed subcontractor entries behind this project cost.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "subcontractor_cost_entries" && base?.items?.length) {
    return {
      content: "I pulled the detailed subcontractor cost entries for the selected scope.",
      bullets: [
        `Entries: ${base.totalEntries || 0}.`,
        `Total subcontractor cost: ${formatCurrency(base.totals?.totalCost || 0)}.`,
        `Total hours captured: ${formatHours(base.totals?.totalHours || 0)}.`,
        `Most recent entry: ${base.items[0]?.projectAddress || base.items[0]?.projectName || "Not available"} on ${String(base.items[0]?.paymentDate || base.items[0]?.createdAt || "").slice(0, 10) || "N/A"}.`,
      ],
      followUp: "I can regroup these entries by project, category, service, week or payment date.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "client_risk_analysis" && base?.items?.length) {
    const topClient = base.items[0];
    return {
      content: `${topClient.clientName} currently combines the highest revenue with the highest payment delay risk in the selected sample.`,
      bullets: [
        `Revenue amount: ${formatCurrency(topClient.revenueAmount || 0)}.`,
        `Open amount: ${formatCurrency(topClient.openAmount || 0)} with ${topClient.overdueInvoices || 0} overdue invoices.`,
        `Risk score: ${Math.round((topClient.riskScore || 0) * 100)}%.`,
      ],
      followUp: "I can list the rest of the clients by revenue and delay risk.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "invoice_aging" && base?.buckets?.length) {
    return {
      content: "I grouped the current open invoices by aging bucket.",
      bullets: [
        `Open receivables: ${formatCurrency(base.totalOpen || 0)}.`,
        `${base.buckets.length} aging buckets were used in this view.`,
      ],
      followUp: "I can list the overdue invoices or break this down by client.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "overdue_invoices" && base?.items?.length) {
    return {
      content: "I found overdue invoices that are already impacting cash flow.",
      bullets: [
        `Overdue amount: ${formatCurrency(base.overdueAmount || 0)}.`,
        `${base.total || 0} overdue invoices are in the current result set.`,
      ],
      followUp: "I can show the clients or projects creating the largest overdue exposure.",
      report: buildReportFromTool(latestTool) || null,
    };
  }

  if (latestTool?.tool === "receivables_by_client" && base?.items?.length) {
    const topClient = base.items[0];
    return {
      content: `${topClient.clientName} currently has the highest open receivables.`,
      bullets: [
        `Open amount: ${formatCurrency(topClient.openAmount || 0)}.`,
        `Overdue amount: ${formatCurrency(topClient.overdueAmount || 0)}.`,
        `${topClient.invoiceCount || 0} unpaid invoices are contributing to this exposure.`,
      ],
      followUp: "I can compare this client against the rest of the portfolio by delay risk.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "list_clients" && base?.items?.length) {
    const topClient = base.items[0];
    return {
      content: "I found client records relevant to your question.",
      bullets: [
        `Top client in the current result set: ${topClient.name}.`,
        `Revenue/invoiced amount: ${formatCurrency(topClient.invoicedAmount || 0)}.`,
        `${base.total || 0} clients were returned by this query.`,
      ],
      followUp: "I can sort this view by revenue, open balance, or delay risk.",
      report: null,
    };
  }

  if (latestTool?.tool === "cashflow_projection" && base?.items?.length) {
    return {
      content: "I mapped the short-term cash impact using overdue invoices and unpaid invoices due in the next 30 days.",
      bullets: [
        `Overdue impact: ${formatCurrency(base.overdueAmount || 0)}.`,
        `Next 30 days impact: ${formatCurrency(base.next30DaysAmount || 0)}.`,
        `${base.totalInvoices || 0} unpaid invoices are contributing to this cash view.`,
      ],
      followUp: "I can also break this down by client or by project.",
      report: buildReportFromTool(latestTool),
    };
  }

  return {
    content: "I couldn't produce a structured answer from the available tool results.",
    bullets: [],
    followUp: undefined,
    report: null,
  };
}
