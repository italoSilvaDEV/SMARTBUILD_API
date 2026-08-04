import { describe, expect, it } from "@jest/globals";

import {
  buildInvoiceTypeFilter,
  expandInvoiceStatusFilters,
  getPendingInvoiceAmount,
} from "./invoiceListFilters";

describe("invoice list filters", () => {
  it("expands pending into every pending database status", () => {
    expect(expandInvoiceStatusFilters(["pending", "paid"])).toEqual([
      "open",
      "draft",
      "partial",
      "paid",
    ]);
  });

  it("keeps QuickBooks separate from Other", () => {
    expect(buildInvoiceTypeFilter(["quickbooks", "other"])).toEqual({
      OR: [
        { invoiceType: "quickbooks" },
        { invoiceType: "custom" },
        { invoiceType: "" },
        { invoiceType: null },
      ],
    });
  });

  it("supports all mobile invoice type filters together", () => {
    expect(buildInvoiceTypeFilter(["stripe", "quickbooks", "other"])).toEqual({
      OR: [
        { invoiceType: "stripe" },
        { invoiceType: "quickbooks" },
        { invoiceType: "custom" },
        { invoiceType: "" },
        { invoiceType: null },
      ],
    });
  });

  it("uses balanceRemaining for partial invoices", () => {
    expect(getPendingInvoiceAmount({
      balanceRemaining: 35,
      payment: { amount: 80 },
      status: "partial",
      totalAmount: 100,
    })).toBe(35);
  });

  it("falls back to QuickBooks paid amount for partial invoices", () => {
    expect(getPendingInvoiceAmount({
      invoiceType: "quickbooks",
      status: "partial",
      totalAmount: 100,
      totalAmountPaidQbo: 40,
    })).toBe(60);
  });

  it("uses QuickBooks payment applications before custom payment data", () => {
    expect(getPendingInvoiceAmount({
      invoiceType: "quickbooks",
      payment: { amount: 90 },
      paymentApplications: [
        { amountApplied: 25 },
        { amountApplied: 15 },
      ],
      status: "partial",
      totalAmount: 100,
    })).toBe(60);
  });

  it("uses custom payment only for custom partial invoices", () => {
    expect(getPendingInvoiceAmount({
      invoiceType: "custom",
      payment: { amount: 40 },
      status: "partial",
      totalAmount: 100,
    })).toBe(60);
  });

  it("does not use custom payment fallback for QuickBooks partial invoices", () => {
    expect(getPendingInvoiceAmount({
      invoiceType: "quickbooks",
      payment: { amount: 40 },
      status: "partial",
      totalAmount: 100,
    })).toBe(0);
  });

  it("never counts the full total when a partial invoice has no balance data", () => {
    expect(getPendingInvoiceAmount({
      status: "partial",
      totalAmount: 100,
    })).toBe(0);
  });
});
