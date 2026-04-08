import { buildTable } from "../reportUtils";
import { formatCurrency } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildClientReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if (tool.tool === "get_client_details" && output?.id) {
    return {
      title: "Client Overview",
      description: "Client profile with active projects and invoice exposure.",
      metrics: [
        { label: "Client", value: output.name || "Not available", tone: "warning" },
        { label: "Projects", value: String(output.financials?.projectCount || 0), tone: "success" },
        { label: "Invoices", value: String(output.financials?.invoiceCount || 0) },
        { label: "Invoiced", value: formatCurrency(output.financials?.invoicedAmount || 0) },
      ],
      table: buildTable(
        [
          { key: "projectAddress", label: "Project" },
          { key: "status", label: "Status" },
          { key: "contractNumber", label: "Contract" },
          { key: "price", label: "Sold Value" },
          { key: "balanceDue", label: "Balance Due" },
          { key: "invoiceCount", label: "Invoices" },
        ],
        (output.projects || []).map((project: any) => ({
          projectAddress: project.projectAddress || project.projectName || null,
          status: project.status || null,
          contractNumber: project.contractNumber ?? null,
          price: formatCurrency(project.price || 0),
          balanceDue: formatCurrency(project.balanceDue || 0),
          invoiceCount: project.invoiceCount ?? 0,
        }))
      ),
    };
  }

  if (tool.tool === "list_clients" && output?.items?.length) {
    return {
      title: "Clients",
      description: "Client list with active project exposure and invoiced amount.",
      metrics: [
        { label: "Clients", value: String(output.total || output.items.length), tone: "success" },
        { label: "Top client", value: output.items[0].name, tone: "warning" },
      ],
      table: buildTable(
        [
          { key: "name", label: "Client" },
          { key: "email", label: "Email" },
          { key: "cityAndState", label: "Location" },
          { key: "projectCount", label: "Projects" },
          { key: "invoiceCount", label: "Invoices" },
          { key: "invoicedAmount", label: "Invoiced" },
        ],
        output.items.map((item: any) => ({
          name: item.name || null,
          email: item.email || null,
          cityAndState: item.cityAndState || null,
          projectCount: item.projectCount ?? 0,
          invoiceCount: item.invoiceCount ?? 0,
          invoicedAmount: formatCurrency(item.invoicedAmount || 0),
        }))
      ),
    };
  }

  if (tool.tool === "receivables_by_client" && output?.items?.length) {
    return {
      title: "Receivables By Client",
      description: "Clients with the highest outstanding receivables.",
      metrics: [
        { label: "Top client", value: output.items[0].clientName, tone: "warning" },
        { label: "Top AR", value: formatCurrency(output.items[0].openAmount || 0) },
      ],
      table: buildTable(
        [
          { key: "clientName", label: "Client" },
          { key: "email", label: "Email" },
          { key: "invoiceCount", label: "Invoices" },
          { key: "openAmount", label: "Open AR" },
          { key: "overdueAmount", label: "Overdue" },
        ],
        output.items.map((item: any) => ({
          clientName: item.clientName || null,
          email: item.email || null,
          invoiceCount: item.invoiceCount ?? 0,
          openAmount: formatCurrency(item.openAmount || 0),
          overdueAmount: formatCurrency(item.overdueAmount || 0),
        }))
      ),
    };
  }

  if (tool.tool === "client_risk_analysis" && output?.items?.length) {
    return {
      title: "Client Revenue And Delay Risk",
      description: "Clients ranked by revenue and payment delay exposure.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.clientName,
        value: item.revenueAmount,
      })),
      metrics: [
        { label: "Top revenue", value: output.items[0].clientName, tone: "warning" },
        { label: "Revenue", value: formatCurrency(output.items[0].revenueAmount || 0) },
        { label: "Risk", value: `${Math.round((output.items[0].riskScore || 0) * 100)}%` },
      ],
      table: buildTable(
        [
          { key: "clientName", label: "Client" },
          { key: "revenueAmount", label: "Revenue" },
          { key: "openAmount", label: "Open AR" },
          { key: "overdueInvoices", label: "Overdue Invoices" },
          { key: "riskScore", label: "Risk %" },
        ],
        output.items.map((item: any) => ({
          clientName: item.clientName || null,
          revenueAmount: formatCurrency(item.revenueAmount || 0),
          openAmount: formatCurrency(item.openAmount || 0),
          overdueInvoices: item.overdueInvoices ?? 0,
          riskScore: `${Math.round((item.riskScore || 0) * 100)}%`,
        }))
      ),
    };
  }

  return null;
}
