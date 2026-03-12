import { compactValue, getCompactReport } from "./reportUtils";
import { formatCurrency, formatHours } from "./utils";
import type { AssistantReport, AssistantStructuredResponse, ExecutedTool } from "./types";

type BuildReportFromTool = (tool: ExecutedTool) => AssistantReport | null;

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
  buildReportFromTool: BuildReportFromTool
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
      content: `${topProject.projectName} is currently the highest-spending project in the selected period for ${topProject.clientName || "this client"}.`,
      bullets: [
        `Project address: ${topProject.projectAddress || topProject.projectName}.`,
        `Estimated total cost: ${formatCurrency(topProject.totalCost || 0)}.`,
        `${base.items.length} projects were evaluated for this ranking.`,
      ],
      followUp: "I can break this down by materials, labor and invoice impact, or show the full ranked list in a table.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "list_projects" && base?.items?.length) {
    return {
      content: `I found ${base.total || base.items.length} active projects.`,
      bullets: [
        `The table follows the Seller Projects structure: number, client, address and value.`,
        `${base.returnedCount || base.items.length} projects are loaded in this response.`,
        `I can narrow this list by status, client, contract number, profitability or highest cost.`,
      ],
      followUp: "If you want, I can sort this by highest value, highest cost, best margin, or filter to one status only.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "top_profitable_projects" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: `${topProject.projectName} is currently the most profitable project for ${topProject.clientName || "this client"}.`,
      bullets: [
        `Project address: ${topProject.projectAddress || topProject.projectName}.`,
        `Sold value: ${formatCurrency(topProject.soldValue || 0)}.`,
        `Material cost: ${formatCurrency(topProject.materialCost || 0)} and labor cost: ${formatCurrency(topProject.laborCost || 0)}.`,
        `Profit: ${formatCurrency(topProject.profitValue || 0)} (${((topProject.profitPct || 0) * 100).toFixed(1)}%).`,
      ],
      followUp: "I can break down why this project is outperforming the rest, or show the full ranked list in a table.",
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
      content: `${topWorker.workerName} is currently the highest labor cost employee in the selected period based on SmartBuild time cards.`,
      bullets: [
        `Total labor cost: ${formatCurrency(topWorker.totalCost || 0)}.`,
        `Total logged hours: ${formatHours(topWorker.totalHours || 0)} across ${topWorker.entryCount || 0} entries, including ${formatHours(topWorker.regularHours || 0)} regular and ${formatHours(topWorker.overtimeHours || 0)} overtime.`,
        `Main project: ${topWorker.topProjectAddress || topWorker.topProjectName || "Not available"} for ${topWorker.topProjectClientName || "the client on record"}.`,
        `This ranking is based on time-card labor pay/cost, not HR salary records.`,
      ],
      followUp: "I can break this worker down by project or by specific date.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "worker_timecard_details" && base?.entries?.length) {
    return {
      content: `${base.workerName} has ${base.totalEntries || 0} time card entries in the selected period.`,
      bullets: [
        `Total labor cost: ${formatCurrency(base.totalCost || 0)} based on SmartBuild time cards.`,
        `Total hours: ${formatHours(base.totalHours || 0)}.`,
        `Most recent project: ${base.entries[0].projectAddress || base.entries[0].projectName || "Not available"} for ${base.entries[0].clientName || "the recorded client"}.`,
        `Each entry includes check-in, check-out, service, category and calculated labor pay.`,
      ],
      followUp: "I can also compare this worker against the rest of the team for the same week.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "timecards_by_project" && base?.items?.length) {
    const topProject = base.items[0];
    return {
      content: `${topProject.projectAddress || topProject.projectName} currently has the highest labor cost in the selected period.`,
      bullets: [
        `Client: ${topProject.clientName || "Not available"}.`,
        `Labor cost: ${formatCurrency(topProject.totalCost || 0)}.`,
        `Total hours: ${formatHours(topProject.totalHours || 0)} across ${topProject.entryCount || 0} entries.`,
      ],
      followUp: "I can show which workers are driving the labor cost on this project.",
      report: buildReportFromTool(latestTool),
    };
  }

  if (latestTool?.tool === "timecard_summary" && base?.byProject?.length) {
    return {
      content: "I summarized the available time cards for the selected scope.",
      bullets: [
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
        `Employees account for ${formatCurrency(base.totals.employeeCost || 0)} across ${base.employee?.totalEntries || 0} time-card entries.`,
        `Subcontractors account for ${formatCurrency(base.totals.subcontractorCost || 0)} across ${base.subcontractor?.totalEntries || 0} cost entries.`,
        `Combined project coverage: ${base.totals.projectCount || 0} active projects.`,
      ],
      followUp: "I can break this down by project, by worker, by subcontractor, or show the detailed tables behind each side.",
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
