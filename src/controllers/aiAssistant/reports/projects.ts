import { buildTable } from "../reportUtils";
import { formatCurrency, formatHours } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildProjectReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if (tool.tool === "list_projects" && output?.items?.length) {
    return {
      title: "Projects",
      description: "Active projects aligned with the Seller Projects list.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.price || 0,
      })),
      metrics: [
        { label: "Projects", value: String(output.total || output.items.length), tone: "success" },
        { label: "Shown", value: String(output.returnedCount || output.items.length) },
      ],
      table: buildTable(
        [
          { key: "contractNumber", label: "Number" },
          { key: "clientName", label: "Client" },
          { key: "projectAddress", label: "Address" },
          { key: "price", label: "Value" },
        ],
        output.items.map((item: any) => ({
          contractNumber: item.contractNumber ?? null,
          clientName: item.clientName || null,
          projectAddress: item.projectAddress || item.projectName || null,
          price: formatCurrency(item.price || 0),
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

  if (tool.tool === "project_status_transitions" && output?.items?.length) {
    return {
      title: "Project Status Transitions",
      description: "Projects that moved into the requested status during the selected period, based on the stored status change date.",
      chartMode: "bar",
      chartData: output.items.slice(0, 8).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: 1,
      })),
      metrics: [
        { label: "Projects", value: String(output.total || output.items.length), tone: "success" },
        { label: "Statuses", value: output.statuses?.length ? output.statuses.join(", ") : "All statuses" },
      ],
      table: buildTable(
        [
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "status", label: "Current Status" },
          { key: "statusChangedAt", label: "Status Changed" },
          { key: "contractNumber", label: "Contract" },
          { key: "price", label: "Sold Value" },
        ],
        output.items.map((item: any) => ({
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          status: item.status || null,
          statusChangedAt: item.statusChangedAt ? String(item.statusChangedAt).slice(0, 10) : null,
          contractNumber: item.contractNumber ?? null,
          price: formatCurrency(item.price || 0),
        }))
      ),
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

  if (tool.tool === "estimate_summary" && output?.items?.length) {
    return {
      title: "Estimate Summary",
      description: "Estimates with sold value, paid amount, balance and approved change-order lift.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName || `Estimate ${item.number || item.id}`,
        value: item.totalAmount || 0,
      })),
      metrics: [
        { label: "Estimates", value: String(output.total || output.items.length), tone: "success" },
        { label: "Total", value: formatCurrency(output.totals?.amount || 0) },
        { label: "Paid", value: formatCurrency(output.totals?.paid || 0) },
        { label: "Balance", value: formatCurrency(output.totals?.balance || 0), tone: "warning" },
      ],
      table: buildTable(
        [
          { key: "number", label: "Estimate" },
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "status", label: "Status" },
          { key: "totalAmount", label: "Amount" },
          { key: "amountPaid", label: "Paid" },
          { key: "balanceDue", label: "Balance" },
          { key: "approvedChangeOrdersValue", label: "Approved COs" },
        ],
        output.items.map((item: any) => ({
          number: item.number || item.id,
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.client?.name || null,
          status: item.status || null,
          totalAmount: formatCurrency(item.totalAmount || 0),
          amountPaid: formatCurrency(item.amountPaid || 0),
          balanceDue: formatCurrency(item.balanceDue || 0),
          approvedChangeOrdersValue: formatCurrency(item.approvedChangeOrdersValue || 0),
        }))
      ),
    };
  }

  if (tool.tool === "project_vs_estimate" && output?.projectId) {
    return {
      title: "Project Vs Estimate",
      description: "Comparison between sold value, latest estimate, invoiced amount and accumulated project cost.",
      chartMode: "bar",
      chartData: [
        { label: "Sold value", value: output.soldValue || 0 },
        { label: "Latest estimate", value: output.latestEstimate?.totalAmount || 0 },
        { label: "Invoiced", value: output.invoiced || 0 },
        { label: "Total cost", value: output.costs?.totalCost || 0 },
      ],
      metrics: [
        { label: "Project", value: output.projectAddress || output.projectName, tone: "warning" },
        { label: "Sold vs estimate", value: formatCurrency(output.deltas?.soldVsEstimate || 0) },
        { label: "Sold vs cost", value: formatCurrency(output.deltas?.soldVsCost || 0), tone: output.deltas?.soldVsCost >= 0 ? "success" : "warning" },
        { label: "Estimate vs cost", value: formatCurrency(output.deltas?.estimateVsCost || 0) },
      ],
      table: buildTable(
        [
          { key: "label", label: "Metric" },
          { key: "value", label: "Value" },
        ],
        [
          { label: "Project", value: output.projectAddress || output.projectName || null },
          { label: "Client", value: output.clientName || null },
          { label: "Latest estimate", value: output.latestEstimate ? formatCurrency(output.latestEstimate.totalAmount || 0) : "Not available" },
          { label: "Invoiced", value: formatCurrency(output.invoiced || 0) },
          { label: "Materials", value: formatCurrency(output.costs?.materialCost || 0) },
          { label: "Labor", value: formatCurrency(output.costs?.laborCost || 0) },
          { label: "Total cost", value: formatCurrency(output.costs?.totalCost || 0) },
          { label: "Sold vs cost", value: formatCurrency(output.deltas?.soldVsCost || 0) },
        ]
      ),
    };
  }

  if (tool.tool === "change_order_summary" && output?.items?.length) {
    return {
      title: "Change Order Summary",
      description: "Change orders by project with approved, pending and canceled value.",
      chartMode: "bar",
      chartData: [
        { label: "Approved", value: output.totals?.approved || 0 },
        { label: "Pending", value: output.totals?.pending || 0 },
        { label: "Canceled", value: output.totals?.canceled || 0 },
      ],
      metrics: [
        { label: "Change orders", value: String(output.total || output.items.length), tone: "success" },
        { label: "Approved", value: formatCurrency(output.totals?.approved || 0) },
        { label: "Pending", value: formatCurrency(output.totals?.pending || 0), tone: "warning" },
        { label: "Canceled", value: formatCurrency(output.totals?.canceled || 0) },
      ],
      table: buildTable(
        [
          { key: "number", label: "CO #" },
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "status", label: "Status" },
          { key: "createdAt", label: "Created" },
          { key: "totalAmount", label: "Amount" },
        ],
        output.items.map((item: any) => ({
          number: item.number || item.id,
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.client?.name || null,
          status: item.status || null,
          createdAt: item.createdAt ? String(item.createdAt).slice(0, 10) : null,
          totalAmount: formatCurrency(item.totalAmount || 0),
        }))
      ),
    };
  }

  return null;
}
