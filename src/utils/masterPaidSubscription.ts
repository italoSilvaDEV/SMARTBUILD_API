export type MasterSubscription = {
  appleBillingStatus?: string | null;
  autoRenewing?: boolean | null;
  billingProvider: string;
  endDate: Date;
  isActive: boolean;
  paymentFailed?: boolean;
  plan?: { validityType: string } | null;
  storeEnvironment?: string | null;
};

export function isMasterPaidSubscription(subscription: MasterSubscription, now = new Date()) {
  if (!subscription.isActive || !subscription.plan || subscription.plan.validityType === "FREE") return false;
  if (subscription.billingProvider !== "apple") return true;

  return subscription.appleBillingStatus === "paid"
    && subscription.storeEnvironment === "production"
    && subscription.endDate > now
    && !subscription.paymentFailed
    && subscription.autoRenewing === true;
}
