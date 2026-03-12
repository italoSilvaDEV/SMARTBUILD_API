import { buildTable } from "../reportUtils";
import { formatCurrency, formatHours } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildTimecardReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if (tool.tool === "timecards_by_worker" && output?.items?.length) {
    return {
      title: "Labor Cost By Worker",
      description: "Workers ranked by total time card cost for the selected period.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.workerName,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Top worker", value: output.items[0].workerName, tone: "warning" },
        { label: "Top cost", value: formatCurrency(output.items[0].totalCost || 0) },
        { label: "Hours", value: formatHours(output.items[0].totalHours || 0) },
      ],
      table: buildTable(
        [
          { key: "workerName", label: "Worker" },
          { key: "entryCount", label: "Entries" },
          { key: "totalHours", label: "Hours" },
          { key: "regularHours", label: "Regular" },
          { key: "overtimeHours", label: "Overtime" },
          { key: "totalCost", label: "Cost" },
          { key: "topProjectAddress", label: "Top Project" },
        ],
        output.items.map((item: any) => ({
          workerName: item.workerName || null,
          entryCount: item.entryCount ?? 0,
          totalHours: formatHours(item.totalHours || 0),
          regularHours: formatHours(item.regularHours || 0),
          overtimeHours: formatHours(item.overtimeHours || 0),
          totalCost: formatCurrency(item.totalCost || 0),
          topProjectAddress: item.topProjectAddress || item.topProjectName || null,
        }))
      ),
    };
  }

  if (tool.tool === "timecard_summary" && output?.byProject?.length) {
    return {
      title: "Time Card Summary",
      description: "Summary of labor hours and cost for the selected scope.",
      chartMode: "bar",
      chartData: output.byProject.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Entries", value: String(output.totalEntries || 0) },
        { label: "Hours", value: formatHours(output.totalHours || 0), tone: "success" },
        { label: "Labor cost", value: formatCurrency(output.totalCost || 0), tone: "warning" },
      ],
      table: buildTable(
        [
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "entries", label: "Entries" },
          { key: "totalHours", label: "Hours" },
          { key: "totalCost", label: "Cost" },
        ],
        output.byProject.map((item: any) => ({
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          entries: item.entries ?? 0,
          totalHours: formatHours(item.totalHours || 0),
          totalCost: formatCurrency(item.totalCost || 0),
        }))
      ),
    };
  }

  if (tool.tool === "employee_vs_subcontractor_spend" && output?.totals) {
    return {
      title: "Employee Vs Subcontractor Spend",
      description: "Combined labor spend for employees and subcontractors using the same selected period.",
      chartMode: "bar",
      chartData: [
        { label: "Employees", value: output.totals.employeeCost || 0 },
        { label: "Subcontractors", value: output.totals.subcontractorCost || 0 },
        { label: "Total", value: output.totals.totalCost || 0 },
      ],
      metrics: [
        { label: "Employee cost", value: formatCurrency(output.totals.employeeCost || 0), tone: "warning" },
        { label: "Subcontractor cost", value: formatCurrency(output.totals.subcontractorCost || 0) },
        { label: "Total spend", value: formatCurrency(output.totals.totalCost || 0), tone: "success" },
        { label: "Period", value: output.periodLabel || "Selected period" },
      ],
      table: buildTable(
        [
          { key: "group", label: "Cost Group" },
          { key: "entries", label: "Entries" },
          { key: "hours", label: "Hours" },
          { key: "projects", label: "Projects" },
          { key: "amount", label: "Amount" },
        ],
        [
          {
            group: "Employees",
            entries: output.employee?.totalEntries ?? 0,
            hours: formatHours(output.employee?.totalHours || 0),
            projects: output.employee?.projectCount ?? 0,
            amount: formatCurrency(output.totals.employeeCost || 0),
          },
          {
            group: "Subcontractors",
            entries: output.subcontractor?.totalEntries ?? 0,
            hours: formatHours(output.subcontractor?.totalHours || 0),
            projects: output.subcontractor?.projectCount ?? 0,
            amount: formatCurrency(output.totals.subcontractorCost || 0),
          },
          {
            group: "Combined total",
            entries: (output.employee?.totalEntries || 0) + (output.subcontractor?.totalEntries || 0),
            hours: formatHours((output.employee?.totalHours || 0) + (output.subcontractor?.totalHours || 0)),
            projects: output.totals.projectCount ?? 0,
            amount: formatCurrency(output.totals.totalCost || 0),
          },
        ]
      ),
    };
  }

  if (tool.tool === "timecards_by_project" && output?.items?.length) {
    return {
      title: "Labor Cost By Project",
      description: "Projects ranked by time card cost for the selected period.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.projectAddress || item.projectName,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Top project", value: output.items[0].projectAddress || output.items[0].projectName, tone: "warning" },
        { label: "Top labor cost", value: formatCurrency(output.items[0].totalCost || 0) },
        { label: "Hours", value: formatHours(output.items[0].totalHours || 0) },
      ],
      table: buildTable(
        [
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "entryCount", label: "Entries" },
          { key: "totalHours", label: "Hours" },
          { key: "totalCost", label: "Cost" },
          { key: "topWorkerName", label: "Top Worker" },
        ],
        output.items.map((item: any) => ({
          projectAddress: item.projectAddress || item.projectName || null,
          clientName: item.clientName || null,
          entryCount: item.entryCount ?? 0,
          totalHours: formatHours(item.totalHours || 0),
          totalCost: formatCurrency(item.totalCost || 0),
          topWorkerName: item.topWorkerName || null,
        }))
      ),
    };
  }

  if (tool.tool === "worker_timecard_details" && output?.workerName && output?.entries?.length) {
    return {
      title: `${output.workerName} Time Card Details`,
      description: "Entry-level time card detail for the selected worker and period.",
      chartMode: "line",
      chartData: output.entries.slice(0, 10).map((entry: any) => ({
        label: entry.workDateLabel || entry.projectAddress || "Entry",
        value: entry.totalCost,
      })),
      metrics: [
        { label: "Worker", value: output.workerName, tone: "warning" },
        { label: "Entries", value: String(output.totalEntries || 0) },
        { label: "Total cost", value: formatCurrency(output.totalCost || 0) },
        { label: "Hours", value: formatHours(output.totalHours || 0), tone: "success" },
      ],
      table: buildTable(
        [
          { key: "workDateLabel", label: "Date" },
          { key: "projectAddress", label: "Project" },
          { key: "clientName", label: "Client" },
          { key: "serviceName", label: "Service" },
          { key: "totalHours", label: "Hours" },
          { key: "totalCost", label: "Cost" },
        ],
        output.entries.map((entry: any) => ({
          workDateLabel: entry.workDateLabel || null,
          projectAddress: entry.projectAddress || entry.projectName || null,
          clientName: entry.clientName || null,
          serviceName: entry.serviceName || null,
          totalHours: formatHours(entry.totalHours || 0),
          totalCost: formatCurrency(entry.totalCost || 0),
        }))
      ),
    };
  }

  if (tool.tool === "timecards_daily_breakdown" && output?.items?.length) {
    return {
      title: "Daily Time Card Breakdown",
      description: "Daily trend of hours and cost for the selected time frame.",
      chartMode: "line",
      chartData: output.items.slice(0, 14).map((item: any) => ({
        label: item.dateLabel,
        value: item.totalCost,
      })),
      metrics: [
        { label: "Days", value: String(output.items.length) },
        { label: "Total cost", value: formatCurrency(output.totalCost || 0) },
        { label: "Hours", value: formatHours(output.totalHours || 0), tone: "success" },
      ],
    };
  }

  return null;
}
