import { describe, expect, it } from "@jest/globals";

import { normalizeInvoiceCoefficient } from "./invoiceCoefficient";

describe("normalizeInvoiceCoefficient", () => {
  it("normalizes a whole percentage to a decimal coefficient", () => {
    expect(normalizeInvoiceCoefficient(100, "percentage")).toBe(1);
    expect(normalizeInvoiceCoefficient("30", "percentage")).toBe(0.3);
  });

  it("keeps an already normalized percentage coefficient", () => {
    expect(normalizeInvoiceCoefficient(1, "percentage")).toBe(1);
    expect(normalizeInvoiceCoefficient(0.4, "percentage")).toBe(0.4);
  });

  it("does not reinterpret fixed-value invoice coefficients as percentages", () => {
    expect(normalizeInvoiceCoefficient(1.5, "value")).toBe(1.5);
    expect(normalizeInvoiceCoefficient(0, "value")).toBe(1);
  });

  it("uses a safe default for an invalid coefficient", () => {
    expect(normalizeInvoiceCoefficient(undefined, "percentage")).toBe(1);
    expect(normalizeInvoiceCoefficient("invalid", "percentage")).toBe(1);
  });
});
