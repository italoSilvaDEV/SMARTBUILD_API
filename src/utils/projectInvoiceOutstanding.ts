import { Prisma } from "@prisma/client";
import { PENDING_INVOICE_STATUSES } from "./invoiceListFilters";

type Amount = Prisma.Decimal | number | string | null;
interface InvoiceBalance {
  status: string;
  invoiceType: string | null;
  totalAmount: Amount;
  balanceRemaining?: Amount;
  totalAmountPaidQbo?: Amount;
  totalAmountPaid?: Amount;
  surchargePaymentLocal?: Amount;
  paymentApplications: { amountApplied: Amount }[];
  payment?: { amount: Amount } | null;
}

const openStatuses = new Set<string>([...PENDING_INVOICE_STATUSES, "pending"]);
const nonNegative = (value: Prisma.Decimal) => Prisma.Decimal.max(value, 0);

export function projectInvoiceOutstanding(invoice: InvoiceBalance): Prisma.Decimal | null {
  const status = invoice.status.trim().toLowerCase();
  // Paid, void/canceled and written-off invoices have no collectible balance.
  if (!openStatuses.has(status)) return new Prisma.Decimal(0);

  const total = nonNegative(new Prisma.Decimal(invoice.totalAmount ?? 0));
  if (invoice.balanceRemaining != null) {
    return nonNegative(new Prisma.Decimal(invoice.balanceRemaining));
  }

  // These are alternate sources for the same payment, not amounts to add together.
  let paid: Prisma.Decimal | undefined;
  if (invoice.invoiceType === "quickbooks") {
    if (invoice.totalAmountPaidQbo != null) {
      paid = new Prisma.Decimal(invoice.totalAmountPaidQbo);
    } else if (invoice.paymentApplications.length > 0) {
      paid = invoice.paymentApplications.reduce(
        (sum, payment) => sum.plus(payment.amountApplied ?? 0), new Prisma.Decimal(0),
      );
    }
  } else if (invoice.payment?.amount != null) {
    paid = new Prisma.Decimal(invoice.payment.amount);
  } else if (invoice.totalAmountPaid != null) {
    // Customer surcharges are not payment toward the invoice principal.
    paid = new Prisma.Decimal(invoice.totalAmountPaid).minus(invoice.surchargePaymentLocal ?? 0);
  }

  if (paid !== undefined) return nonNegative(total.minus(nonNegative(paid)));
  // An incomplete partial payment cannot safely be reported as zero or fully unpaid.
  return status === "partial" && total.greaterThan(0) ? null : total;
}
