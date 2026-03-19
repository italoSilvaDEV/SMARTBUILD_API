import { buildTable } from "../reportUtils";
import { formatCurrency } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildCompanyReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if (tool.tool === "company_overview" && output?.totals) {
    return {
      title: "Company Overview",
      description: "Consolidated view of projects, clients and invoices.",
      chartMode: "bar",
      chartData: [
        { label: "Invoiced", value: output.totals.invoiced || 0 },
        { label: "Paid", value: output.totals.paid || 0 },
        { label: "Open", value: output.totals.open || 0 },
        { label: "Overdue", value: output.totals.overdue || 0 },
      ],
      metrics: [
        { label: "Projects", value: String(output.projectCount || 0) },
        { label: "Clients", value: String(output.clientCount || 0) },
        { label: "Invoices", value: String(output.invoiceCount || 0), tone: "success" },
      ],
    };
  }

  if (tool.tool === "financial_period_comparison" && output?.rows?.length) {
    return {
      title: "Financial Period Comparison",
      description: "Side-by-side comparison between the selected period and the previous equivalent period.",
      chartMode: "bar",
      chartData: [
        { label: "Current total cost", value: output.current?.totalCost || 0 },
        { label: "Previous total cost", value: output.previous?.totalCost || 0 },
        { label: "Current invoice value", value: output.current?.invoiceValue || 0 },
        { label: "Previous invoice value", value: output.previous?.invoiceValue || 0 },
      ],
      metrics: [
        { label: "Current period", value: output.current?.dateRangeLabel || output.current?.label || "Selected period", tone: "warning" },
        { label: "Previous period", value: output.previous?.dateRangeLabel || output.previous?.label || "Previous period" },
        { label: "Current cost", value: formatCurrency(output.current?.totalCost || 0), tone: "success" },
        { label: "Previous cost", value: formatCurrency(output.previous?.totalCost || 0) },
      ],
      table: buildTable(
        [
          { key: "label", label: "KPI" },
          { key: "currentValue", label: output.current?.dateRangeLabel || "Current period" },
          { key: "previousValue", label: output.previous?.dateRangeLabel || "Previous period" },
          { key: "variance", label: "Variance" },
          { key: "variancePct", label: "Variance %" },
        ],
        output.rows.map((row: any) => ({
          label: row.label,
          currentValue: row.format === "number" ? Number(row.currentValue || 0).toLocaleString("en-US") : formatCurrency(row.currentValue || 0),
          previousValue: row.format === "number" ? Number(row.previousValue || 0).toLocaleString("en-US") : formatCurrency(row.previousValue || 0),
          variance: row.format === "number"
            ? `${row.variance >= 0 ? "+" : ""}${Number(row.variance || 0).toLocaleString("en-US")}`
            : `${row.variance >= 0 ? "+" : "-"}${formatCurrency(Math.abs(row.variance || 0))}`,
          variancePct: `${row.variancePct >= 0 ? "+" : ""}${((row.variancePct || 0) * 100).toFixed(1)}%`,
        }))
      ),
    };
  }

  return null;
}
