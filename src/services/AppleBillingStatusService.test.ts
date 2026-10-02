import { describe, expect, it } from "@jest/globals";
import { classifyAppleBillingStatus } from "./AppleBillingStatusService";

const future = Date.now() + 60_000;

describe("Apple billing status", () => {
  it("requires a charged transaction after the free trial", () => {
    expect(classifyAppleBillingStatus({ status: 1, autoRenewStatus: 1, price: 0, offerDiscountType: "FREE_TRIAL", expiresDate: future })).toBe("trial");
    expect(classifyAppleBillingStatus({ status: 1, autoRenewStatus: 1, price: 29_000, expiresDate: future })).toBe("paid");
    expect(classifyAppleBillingStatus({ status: 1, autoRenewStatus: 1, expiresDate: future })).toBe("unknown");
  });

  it("removes cancellations, billing failures and refunds from paid status", () => {
    expect(classifyAppleBillingStatus({ status: 1, autoRenewStatus: 0, price: 29_000, expiresDate: future })).toBe("canceled");
    expect(classifyAppleBillingStatus({ status: 3, autoRenewStatus: 1, price: 29_000, expiresDate: future })).toBe("payment_failed");
    expect(classifyAppleBillingStatus({ status: 4, autoRenewStatus: 1, price: 29_000, expiresDate: future })).toBe("payment_failed");
    expect(classifyAppleBillingStatus({ status: 5, autoRenewStatus: 1, price: 29_000, expiresDate: future })).toBe("refunded");
    expect(classifyAppleBillingStatus({ status: 2, autoRenewStatus: 0, price: 29_000, expiresDate: future })).toBe("expired");
  });
});
