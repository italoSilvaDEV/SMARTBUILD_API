import { buildTable } from "../reportUtils";
import { formatCurrency, formatHours } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildSubcontractorReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if ((tool.tool === "subcontractor_summary" || tool.tool === "list_subcontractors") && output?.items?.length) {
    return {
      title: "Subcontractor Cost Ranking",
      description: "Subcontractors ranked by actual subcontractor cost with project coverage and status mix.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.name,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Total cost", value: formatCurrency(output.totals?.totalSubcontractorCosts || 0), tone: "warning" },
        { label: "Projects", value: String(output.totals?.totalProjects || 0) },
        { label: "Subcontractors", value: String(output.totalSubcontractors || output.items.length), tone: "success" },
      ],
      table: buildTable(
        [
          { key: "name", label: "Subcontractor" },
          { key: "projectCount", label: "Projects" },
          { key: "entryCount", label: "Entries" },
          { key: "totalHours", label: "Hours" },
          { key: "totalCost", label: "Cost" },
          { key: "topProjectAddress", label: "Top Project" },
        ],
        output.items.map((item: any) => ({
          name: item.name || null,
          projectCount: item.projectCount ?? 0,
          entryCount: item.entryCount ?? 0,
          totalHours: formatHours(item.totalHours || 0),
          totalCost: formatCurrency(item.totalCost || 0),
          topProjectAddress: item.topProjectAddress || item.topProjectName || null,
        }))
      ),
    };
  }

  if (tool.tool === "get_subcontractor_details" && output?.subcontractor && output?.monthlySales?.length) {
    return {
      title: `${output.subcontractor.name} Cost Timeline`,
      description: "Timeline, cost totals and project distribution for the selected subcontractor.",
      chartMode: "line",
      chartData: output.monthlySales.slice(-12).map((item: any) => ({
        label: item.month,
        value: item.value,
      })),
      metrics: [
        { label: "Total cost", value: formatCurrency(output.totals?.totalCost || 0), tone: "warning" },
        { label: "Projects", value: String(output.totals?.totalProjects || 0) },
        { label: "Entries", value: String(output.totals?.totalEntries || 0) },
        { label: "Avg / project", value: formatCurrency(output.totals?.averageCostPerProject || 0), tone: "success" },
      ],
    };
  }

  if (tool.tool === "subcontractor_projects" && output?.items?.length) {
    return {
      title: "Subcontractor Projects",
      description: "Projects ranked by subcontractor cost, including address, client and cost share.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Projects", value: String(output.totalProjects || output.items.length) },
        { label: "Top project", value: output.items[0].projectAddress || output.items[0].projectName, tone: "warning" },
        { label: "Top cost", value: formatCurrency(output.items[0].totalCost || 0) },
      ],
      table: buildTable(
        [
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "status", label: "Status" },
          { key: "entryCount", label: "Entries" },
          { key: "totalHours", label: "Hours" },
          { key: "totalCost", label: "Cost" },
        ],
        output.items.map((item: any) => ({
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          status: item.status || null,
          entryCount: item.entryCount ?? 0,
          totalHours: formatHours(item.totalHours || 0),
          totalCost: formatCurrency(item.totalCost || 0),
        }))
      ),
    };
  }

  if (tool.tool === "subcontractor_cost_entries" && output?.items?.length) {
    return {
      title: "Subcontractor Cost Entries",
      description: "Detailed cost entries by payment/creation date for the selected subcontractor scope.",
      chartMode: "line",
      chartData: output.items.slice(0, 12).reverse().map((item: any) => ({
        label: String(item.paymentDate || item.createdAt || "").slice(0, 10) || item.projectAddress || "Entry",
        value: item.totalCost,
      })),
      metrics: [
        { label: "Entries", value: String(output.totalEntries || 0) },
        { label: "Total cost", value: formatCurrency(output.totals?.totalCost || 0), tone: "warning" },
        { label: "Hours", value: formatHours(output.totals?.totalHours || 0), tone: "success" },
      ],
      table: buildTable(
        [
          { key: "paymentDate", label: "Payment Date" },
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "serviceName", label: "Service" },
          { key: "totalHours", label: "Hours" },
          { key: "totalCost", label: "Cost" },
        ],
        output.items.map((item: any) => ({
          paymentDate: String(item.paymentDate || item.createdAt || "").slice(0, 10) || null,
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          serviceName: item.serviceName || item.categoryName || null,
          totalHours: formatHours(item.totalHours || 0),
          totalCost: formatCurrency(item.totalCost || 0),
        }))
      ),
    };
  }

  return null;
}
