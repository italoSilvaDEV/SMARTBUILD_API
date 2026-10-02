import { describe, expect, it } from "@jest/globals";
import { isMasterPaidSubscription, MasterSubscription } from "./masterPaidSubscription";

const base: MasterSubscription = {
  billingProvider: "apple",
  isActive: true,
  endDate: new Date("2027-01-01"),
  plan: { validityType: "MONTHLY" },
  appleBillingStatus: "paid",
  storeEnvironment: "production",
  autoRenewing: true,
  paymentFailed: false,
};

describe("master paid clients", () => {
  const now = new Date("2026-10-02");

  it("counts only currently paid, renewing production Apple subscriptions", () => {
    expect(isMasterPaidSubscription(base, now)).toBe(true);
    for (const change of [
      { appleBillingStatus: "trial" },
      { appleBillingStatus: "canceled" },
      { appleBillingStatus: "payment_failed" },
      { appleBillingStatus: "refunded" },
      { storeEnvironment: "sandbox" },
      { autoRenewing: false },
      { paymentFailed: true },
      { endDate: new Date("2026-10-01") },
    ]) {
      expect(isMasterPaidSubscription({ ...base, ...change }, now)).toBe(false);
    }
  });

  it("preserves the existing Stripe rule", () => {
    expect(isMasterPaidSubscription({ ...base, billingProvider: "stripe", appleBillingStatus: null }, now)).toBe(true);
    expect(isMasterPaidSubscription({ ...base, billingProvider: "stripe", plan: { validityType: "FREE" } }, now)).toBe(false);
  });
});
