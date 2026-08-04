export const PENDING_INVOICE_STATUSES = ["open", "draft", "partial"] as const;

export function parseInvoiceFilter(value: unknown): string[] {
  if (!value) return [];

  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap((item) => String(item).split(","))
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function expandInvoiceStatusFilters(value: unknown): string[] {
  const filters = parseInvoiceFilter(value);
  const statuses = filters.flatMap((filter) =>
    filter === "pending" ? [...PENDING_INVOICE_STATUSES] : [filter],
  );

  return [...new Set(statuses)];
}

export function buildInvoiceTypeFilter(value: unknown): Record<string, unknown> | undefined {
  const filters = new Set(parseInvoiceFilter(value));
  const conditions: Record<string, unknown>[] = [];

  if (filters.has("stripe")) conditions.push({ invoiceType: "stripe" });
  if (filters.has("quickbooks")) conditions.push({ invoiceType: "quickbooks" });
  if (filters.has("other")) {
    conditions.push(
      { invoiceType: "custom" },
      { invoiceType: "" },
      { invoiceType: null },
    );
  }

  return conditions.length > 0 ? { OR: conditions } : undefined;
}

export function getPendingInvoiceAmount(invoice: any): number {
  const status = String(invoice.status || "").toLowerCase();
  const invoiceType = String(invoice.invoiceType || "").toLowerCase();
  const totalAmount = Number(invoice.totalAmount) || 0;

  if (status === "partial") {
    if (invoice.balanceRemaining !== null && invoice.balanceRemaining !== undefined) {
      return Math.max(0, Number(invoice.balanceRemaining) || 0);
    }

    if (invoice.totalAmountPaidQbo !== null && invoice.totalAmountPaidQbo !== undefined) {
      return Math.max(0, totalAmount - (Number(invoice.totalAmountPaidQbo) || 0));
    }

    if (Array.isArray(invoice.paymentApplications) && invoice.paymentApplications.length > 0) {
      const appliedAmount = invoice.paymentApplications.reduce(
        (sum: number, application: any) => sum + (Number(application?.amountApplied) || 0),
        0,
      );

      return Math.max(0, totalAmount - appliedAmount);
    }

    if (invoice.totalAmountPaid !== null && invoice.totalAmountPaid !== undefined) {
      return Math.max(0, totalAmount - (Number(invoice.totalAmountPaid) || 0));
    }

    if (invoiceType === "custom" && invoice.payment?.amount !== null && invoice.payment?.amount !== undefined) {
      return Math.max(0, totalAmount - (Number(invoice.payment.amount) || 0));
    }

    return 0;
  }

  return status === "open" || status === "draft" ? totalAmount : 0;
}
