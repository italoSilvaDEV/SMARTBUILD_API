import { Prisma } from "@prisma/client";
import { projectInvoiceOutstanding } from "./projectInvoiceOutstanding";

type Invoice = Parameters<typeof projectInvoiceOutstanding>[0];
const invoice = (overrides: Partial<Invoice> = {}): Invoice => ({
  status: "open", invoiceType: "custom", totalAmount: new Prisma.Decimal(100),
  paymentApplications: [], ...overrides,
});
const balance = (overrides: Partial<Invoice>) => projectInvoiceOutstanding(invoice(overrides))?.toNumber() ?? null;

describe("project invoice outstanding balance", () => {
  it.each(["open", "draft", "pending", " OPEN "])("includes unpaid %s invoices", status => {
    expect(balance({ status })).toBe(100);
  });

  it.each(["paid", "PAID", "void", "voided", "canceled", "cancelled", "uncollectible"])(
    "excludes %s even with a stale positive balance", status => {
      expect(balance({ status, balanceRemaining: 100 })).toBe(0);
    },
  );

  it.each([0, 60])("uses canonical balance %s without subtracting payments again", balanceRemaining => {
    expect(balance({ status: "partial", invoiceType: "quickbooks", balanceRemaining,
      totalAmountPaidQbo: 40, paymentApplications: [{ amountApplied: 40 }] })).toBe(balanceRemaining);
  });

  it("uses QBO paid total before applications, including an explicit zero", () => {
    expect(balance({ status: "partial", invoiceType: "quickbooks", totalAmountPaidQbo: 40,
      paymentApplications: [{ amountApplied: 40 }] })).toBe(60);
    expect(balance({ invoiceType: "quickbooks", totalAmountPaidQbo: 0,
      paymentApplications: [{ amountApplied: 40 }] })).toBe(100);
  });

  it("sums QBO applications with decimal precision when totals are absent", () => {
    expect(balance({ status: "partial", invoiceType: "quickbooks", totalAmount: "1.00",
      paymentApplications: [{ amountApplied: "0.10" }, { amountApplied: "0.20" }] })).toBe(0.7);
  });

  it("deducts a custom partial payment once", () => {
    expect(balance({ status: "partial", payment: { amount: 40 }, totalAmountPaid: 40 })).toBe(60);
  });

  it("excludes customer surcharge from the principal payment fallback", () => {
    expect(balance({ status: "partial", invoiceType: "stripe", totalAmountPaid: 43,
      surchargePaymentLocal: 3 })).toBe(60);
    expect(balance({ status: "partial", totalAmountPaid: 40 })).toBe(60);
  });

  it("does not let negative balances or overpayments offset other invoices", () => {
    expect(balance({ balanceRemaining: -20 })).toBe(0);
    expect(balance({ payment: { amount: 120 } })).toBe(0);
    expect(balance({ totalAmount: -20 })).toBe(0);
    expect(balance({ payment: { amount: -20 } })).toBe(100);
  });

  it("distinguishes incomplete partial data from a known zero balance", () => {
    expect(balance({ status: "partial" })).toBeNull();
    expect(balance({ status: "partial", invoiceType: "quickbooks" })).toBeNull();
    expect(balance({ status: "partial", totalAmount: 0 })).toBe(0);
    expect(balance({ status: "partial", balanceRemaining: 0 })).toBe(0);
  });
});
