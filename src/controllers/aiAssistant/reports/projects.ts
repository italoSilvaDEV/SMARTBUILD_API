import { buildTable } from "../reportUtils";
import { formatCurrency, formatHours } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildProjectReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if (tool.tool === "list_projects" && output?.items?.length) {
    return {
      title: "Projects",
      description: "Active projects with status, client and financial position.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.price || 0,
      })),
      metrics: [
        { label: "Projects", value: String(output.total || output.items.length), tone: "success" },
        { label: "Top project", value: output.items[0].projectAddress || output.items[0].projectName, tone: "warning" },
      ],
      table: buildTable(
        [
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "status", label: "Status" },
          { key: "contractNumber", label: "Contract" },
          { key: "price", label: "Sold Value" },
          { key: "balanceDue", label: "Balance Due" },
          { key: "invoiceCount", label: "Invoices" },
        ],
        output.items.map((item: any) => ({
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          status: item.status || null,
          contractNumber: item.contractNumber ?? null,
          price: formatCurrency(item.price || 0),
          balanceDue: formatCurrency(item.balanceDue || 0),
          invoiceCount: item.invoiceCount ?? 0,
        }))
      ),
    };
  }

  if (tool.tool === "top_spending_projects" && output?.items?.length) {
    return {
      title: "Top Spending Projects",
      description: "Projects ranked by highest accumulated cost.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Top project", value: output.items[0].projectAddress || output.items[0].projectName, tone: "warning" },
        { label: "Client", value: output.items[0].clientName || "Not available" },
        { label: "Top cost", value: formatCurrency(output.items[0].totalCost || 0) },
        { label: "Projects", value: String(output.items.length), tone: "success" },
      ],
      table: buildTable(
        [
          { key: "rank", label: "#" },
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "contractNumber", label: "Contract" },
          { key: "materialCost", label: "Materials" },
          { key: "laborCost", label: "Labor" },
          { key: "totalCost", label: "Total Cost" },
        ],
        output.items.map((item: any, index: number) => ({
          rank: index + 1,
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          contractNumber: item.contractNumber ?? null,
          materialCost: formatCurrency(item.materialCost || 0),
          laborCost: formatCurrency(item.laborCost || 0),
          totalCost: formatCurrency(item.totalCost || 0),
        }))
      ),
    };
  }

  if (tool.tool === "top_profitable_projects" && output?.items?.length) {
    return {
      title: "Top Projects By Profit",
      description: "Profitability ranked using sold value minus material and labor cost.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.profitValue,
      })),
      metrics: [
        { label: "Top project", value: output.items[0].projectAddress || output.items[0].projectName, tone: "warning" },
        { label: "Top profit", value: formatCurrency(output.items[0].profitValue || 0) },
        { label: "Profitable", value: String(output.profitableCount || 0), tone: "success" },
      ],
      table: buildTable(
        [
          { key: "rank", label: "#" },
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "contractNumber", label: "Contract" },
          { key: "soldValue", label: "Sold Value" },
          { key: "materialCost", label: "Materials" },
          { key: "laborCost", label: "Labor" },
          { key: "profitValue", label: "Profit" },
          { key: "profitPct", label: "Margin %" },
        ],
        output.items.map((item: any, index: number) => ({
          rank: index + 1,
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          contractNumber: item.contractNumber ?? null,
          soldValue: formatCurrency(item.soldValue || 0),
          materialCost: formatCurrency(item.materialCost || 0),
          laborCost: formatCurrency(item.laborCost || 0),
          profitValue: formatCurrency(item.profitValue || 0),
          profitPct: `${((item.profitPct || 0) * 100).toFixed(1)}%`,
        }))
      ),
    };
  }

  if (tool.tool === "get_project_details" && output?.id) {
    return {
      title: "Project Overview",
      description: "Operational and financial snapshot for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Sold value", value: output.price || 0 },
        { label: "Total cost", value: output.financials?.totalCost || 0 },
        { label: "Invoiced", value: output.financials?.invoicedAmount || 0 },
      ],
      metrics: [
        { label: "Project", value: output.projectAddress || output.projectName, tone: "warning" },
        { label: "Client", value: output.clientName || "Not available" },
        { label: "Status", value: output.status || "Not available" },
        { label: "Services", value: String(output.services?.length || 0), tone: "success" },
      ],
    };
  }

  if (tool.tool === "project_cost_breakdown" && output?.totals) {
    return {
      title: "Project Cost Breakdown",
      description: "Material, internal labor and subcontractor cost exposure for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Materials", value: output.totals.materialCost || 0 },
        { label: "Internal labor", value: output.totals.internalLaborCost || 0 },
        { label: "Subcontractors", value: output.totals.subcontractorCost || 0 },
      ],
      metrics: [
        { label: "Project", value: output.projectAddress || output.projectName, tone: "warning" },
        { label: "Total cost", value: formatCurrency(output.totals.totalCost || 0) },
        { label: "Materials", value: formatCurrency(output.totals.materialCost || 0) },
        { label: "Labor", value: formatCurrency(output.totals.laborCost || 0), tone: "success" },
      ],
    };
  }

  if (tool.tool === "project_margin_analysis" && output?.margin) {
    return {
      title: "Project Margin Analysis",
      description: "Sold value versus cost, invoice and receivable position for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Sold value", value: output.soldValue || 0 },
        { label: "Total cost", value: output.costs?.totalCost || 0 },
        { label: "Invoiced", value: output.invoiced || 0 },
      ],
      metrics: [
        { label: "Margin", value: formatCurrency(output.margin.value || 0), tone: output.margin.value >= 0 ? "success" : "warning" },
        { label: "Margin %", value: `${((output.margin.percentage || 0) * 100).toFixed(1)}%` },
        { label: "Amount paid", value: formatCurrency(output.amountPaid || 0) },
        { label: "Balance due", value: formatCurrency(output.balanceDue || 0) },
      ],
    };
  }

  if (tool.tool === "project_schedule_risk" && output?.projectId) {
    return {
      title: "Project Schedule Risk",
      description: "Risk view based on deadline pressure, stalled services and open task volume.",
      chartMode: "bar",
      chartData: [
        { label: "Risk score", value: output.riskScore || 0 },
        { label: "Stalled services", value: output.stalledServices || 0 },
        { label: "Open tasks", value: output.openTasks || 0 },
      ],
      metrics: [
        { label: "Risk", value: output.riskLevel || "low", tone: output.riskLevel === "high" ? "warning" : "default" },
        { label: "Days to deadline", value: output.daysToDeadline == null ? "N/A" : String(output.daysToDeadline) },
        { label: "Status", value: output.status || "Not available" },
      ],
    };
  }

  if (tool.tool === "project_services_detail" && output?.services?.length) {
    return {
      title: "Project Services",
      description: "Services ranked by planned value, stage progression and material cost.",
      chartMode: "bar",
      chartData: output.services.slice(0, 6).map((service: any) => ({
        label: service.name,
        value: service.plannedValue,
      })),
      metrics: [
        { label: "Services", value: String(output.totalServices || output.services.length) },
        { label: "Planned value", value: formatCurrency(output.totals?.plannedValue || 0) },
        { label: "Material cost", value: formatCurrency(output.totals?.materialCost || 0), tone: "warning" },
      ],
    };
  }

  if (tool.tool === "project_files_detail" && output?.totals) {
    return {
      title: "Project Files",
      description: "File cabinet overview including folders, project files and contract files.",
      chartMode: "bar",
      chartData: [
        { label: "Folders", value: output.totals.folders || 0 },
        { label: "Files", value: output.totals.files || 0 },
        { label: "Contract files", value: output.totals.contractFiles || 0 },
      ],
      metrics: [
        { label: "Folders", value: String(output.totals.folders || 0) },
        { label: "Files", value: String(output.totals.files || 0), tone: "success" },
        { label: "Contract files", value: String(output.totals.contractFiles || 0) },
      ],
    };
  }

  if (tool.tool === "project_tasks_detail" && output?.items?.length) {
    return {
      title: "Project Tasks",
      description: "Task status and urgency distribution for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Open", value: output.totals?.open || 0 },
        { label: "In progress", value: output.totals?.inProgress || 0 },
        { label: "Completed", value: output.totals?.completed || 0 },
        { label: "Overdue", value: output.totals?.overdue || 0 },
      ],
      metrics: [
        { label: "Tasks", value: String(output.totals?.totalTasks || 0) },
        { label: "Urgent", value: String(output.totals?.urgent || 0), tone: "warning" },
        { label: "Overdue", value: String(output.totals?.overdue || 0) },
      ],
    };
  }

  if (tool.tool === "project_feed_detail" && output?.totals) {
    return {
      title: "Project Activity Feed",
      description: "Recent feed activity and photo volume for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Activities", value: output.totals.activities || 0 },
        { label: "Photos", value: output.totals.photos || 0 },
        { label: "Services", value: output.totals.services || 0 },
      ],
      metrics: [
        { label: "Activities", value: String(output.totals.activities || 0) },
        { label: "Photos", value: String(output.totals.photos || 0), tone: "success" },
      ],
    };
  }

  if (tool.tool === "project_invoices_detail" && output?.items?.length) {
    return {
      title: "Project Invoices",
      description: "Invoice totals and receivable status for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Invoiced", value: output.totals?.totalInvoiced || 0 },
        { label: "Paid", value: output.totals?.paidAmount || 0 },
        { label: "Open", value: output.totals?.openAmount || 0 },
        { label: "Overdue", value: output.totals?.overdueAmount || 0 },
      ],
      metrics: [
        { label: "Invoices", value: String(output.totals?.invoiceCount || 0) },
        { label: "Open", value: formatCurrency(output.totals?.openAmount || 0), tone: "warning" },
        { label: "Overdue", value: formatCurrency(output.totals?.overdueAmount || 0) },
      ],
    };
  }

  if (tool.tool === "project_change_orders_detail" && output?.items?.length) {
    return {
      title: "Project Change Orders",
      description: "Change order volume and value for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Approved", value: output.totals?.approvedAmount || 0 },
        { label: "Pending", value: output.totals?.pendingAmount || 0 },
        { label: "Total", value: output.totals?.totalAmount || 0 },
      ],
      metrics: [
        { label: "Count", value: String(output.totals?.count || 0) },
        { label: "Approved", value: formatCurrency(output.totals?.approvedAmount || 0), tone: "success" },
        { label: "Pending", value: formatCurrency(output.totals?.pendingAmount || 0), tone: "warning" },
      ],
    };
  }

  if (tool.tool === "project_team_detail" && output?.totals) {
    return {
      title: "Project Team Cost",
      description: "Internal employee and subcontractor cost footprint for the selected project.",
      chartMode: "bar",
      chartData: [
        { label: "Employees", value: output.totals?.employeeLaborCost || 0 },
        { label: "Subcontractors", value: output.totals?.subcontractorCost || 0 },
      ],
      metrics: [
        { label: "Employees", value: String(output.totals?.employeeCount || 0) },
        { label: "Subcontractors", value: String(output.totals?.subcontractorCount || 0), tone: "success" },
        { label: "Hours", value: formatHours(output.totals?.totalHours || 0) },
      ],
    };
  }

  return null;
}
