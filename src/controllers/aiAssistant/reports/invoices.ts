import { buildTable } from "../reportUtils";
import { formatCurrency } from "../utils";
import type { AssistantReport, ExecutedTool } from "../types";

export function buildInvoiceReport(tool: ExecutedTool): AssistantReport | null {
  const output: any = tool.output;

  if (tool.tool === "invoice_summary" && output?.totals) {
    return {
      title: "Invoice Summary",
      description: "Company invoice totals with paid, open and overdue exposure.",
      metrics: [
        { label: "Invoices", value: String(output.totalCount || 0), tone: "success" },
        { label: "Total", value: formatCurrency(output.totals.total || 0) },
        { label: "Open", value: formatCurrency(output.totals.open || 0), tone: "warning" },
        { label: "Overdue", value: formatCurrency(output.totals.overdue || 0) },
      ],
      table: buildTable(
        [
          { key: "id", label: "Invoice" },
          { key: "clientName", label: "Client" },
          { key: "contractNumber", label: "Contract" },
          { key: "status", label: "Status" },
          { key: "invoiceType", label: "Type" },
          { key: "dueDate", label: "Due Date" },
          { key: "totalAmount", label: "Amount" },
        ],
        (output.items || []).map((item: any) => ({
          id: item.id,
          clientName: item.client?.name || null,
          contractNumber: item.contractNumber ?? null,
          status: item.status || null,
          invoiceType: item.invoiceType || null,
          dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : null,
          totalAmount: formatCurrency(item.totalAmount || 0),
        }))
      ),
    };
  }

  if (tool.tool === "list_invoices" && output?.items?.length) {
    return {
      title: "Invoices",
      description: "Invoice list with client, project, due date and amount.",
      metrics: [
        { label: "Invoices", value: String(output.total || output.items.length), tone: "success" },
        { label: "Latest", value: String(output.items[0].id || "N/A"), tone: "warning" },
      ],
      table: buildTable(
        [
          { key: "id", label: "Invoice" },
          { key: "clientName", label: "Client" },
          { key: "contractNumber", label: "Contract" },
          { key: "status", label: "Status" },
          { key: "invoiceType", label: "Type" },
          { key: "dueDate", label: "Due Date" },
          { key: "totalAmount", label: "Amount" },
        ],
        output.items.map((item: any) => ({
          id: item.id,
          clientName: item.client?.name || null,
          contractNumber: item.contractNumber ?? null,
          status: item.status || null,
          invoiceType: item.invoiceType || null,
          dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : null,
          totalAmount: formatCurrency(item.totalAmount || 0),
        }))
      ),
    };
  }

  if (tool.tool === "invoice_aging" && output?.buckets?.length) {
    return {
      title: "Invoice Aging",
      description: "Distribution of open invoices by aging bucket.",
      chartMode: "pie",
      chartData: output.buckets,
      metrics: [
        { label: "Open AR", value: formatCurrency(output.totalOpen || 0), tone: "warning" },
        { label: "Buckets", value: String(output.buckets.length) },
      ],
      table: buildTable(
        [
          { key: "label", label: "Bucket" },
          { key: "value", label: "Open Amount" },
        ],
        output.buckets.map((item: any) => ({
          label: item.label,
          value: formatCurrency(item.value || 0),
        }))
      ),
    };
  }

  if (tool.tool === "overdue_invoices" && output?.items?.length) {
    return {
      title: "Overdue Invoices",
      description: "Invoices already past due and impacting cash collection.",
      metrics: [
        { label: "Overdue amount", value: formatCurrency(output.overdueAmount || 0), tone: "warning" },
        { label: "Invoices", value: String(output.total || output.items.length) },
      ],
      table: buildTable(
        [
          { key: "id", label: "Invoice" },
          { key: "clientName", label: "Client" },
          { key: "contractNumber", label: "Contract" },
          { key: "status", label: "Status" },
          { key: "dueDate", label: "Due Date" },
          { key: "totalAmount", label: "Amount" },
        ],
        output.items.map((item: any) => ({
          id: item.id,
          clientName: item.client?.name || null,
          contractNumber: item.contractNumber ?? null,
          status: item.status || null,
          dueDate: item.dueDate ? String(item.dueDate).slice(0, 10) : null,
          totalAmount: formatCurrency(item.totalAmount || 0),
        }))
      ),
    };
  }

  if (tool.tool === "cashflow_projection" && output?.items?.length) {
    return {
      title: "Cash Impact Next 30 Days",
      description: "Upcoming and overdue unpaid invoices impacting short-term cash flow.",
      chartMode: "bar",
      chartData: output.items.slice(0, 6).map((item: any) => ({
        label: item.label,
        value: item.amount,
      })),
      metrics: [
        { label: "Overdue", value: formatCurrency(output.overdueAmount || 0), tone: "warning" },
        { label: "Next 30 days", value: formatCurrency(output.next30DaysAmount || 0) },
        { label: "Invoices", value: String(output.totalInvoices || 0), tone: "success" },
      ],
    };
  }

  return null;
}
