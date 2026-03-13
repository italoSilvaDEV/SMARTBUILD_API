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

  return null;
}
