import { Prisma } from '@prisma/client';

export type PurchaseProvider = 'stripe' | 'apple' | 'google';
export type PurchaseRecord = {
  id?: string;
  googleState?: string | null;
  billingProvider: string;
  isActive: boolean;
  paymentFailed: boolean;
  endDate: Date;
  stripeSubscriptionCanceled: boolean;
  appleBillingStatus: string | null;
  plan: { validityType: string };
};

export class SubscriptionPurchaseConflict extends Error {
  readonly status = 409;
  readonly code = 'SUBSCRIPTION_PROVIDER_CONFLICT';
  constructor(public readonly provider: string) {
    super(`This company has a subscription or unresolved billing with ${provider}. Manage it with that provider before subscribing elsewhere.`);
  }
}

// Purchase eligibility is stricter than access. Suspension/failed renewal can deny
// features while the original provider still has a recoverable charge.
export function conflictingProvider(records: readonly PurchaseRecord[], target: PurchaseProvider, now = new Date()): string | null {
  for (const row of records) {
    if (row.billingProvider === target || row.plan.validityType === 'FREE') continue;
    if (row.isActive) return row.billingProvider;
    if (row.billingProvider === 'stripe') {
      // Local dates and local admin deactivation do not confirm provider closure.
      if (!row.stripeSubscriptionCanceled) return 'stripe';
      continue;
    }
    if (row.billingProvider === 'apple') {
      if (['expired', 'refunded'].includes(row.appleBillingStatus ?? '')) continue;
      return 'apple'; // Includes billing retry, grace and unverified legacy rows.
    }
    // Google terminal rows are persisted by the verified reconciler. HOLD sets
    // paymentFailed; a future paid date or an invalid date is not terminal proof.
    if (row.billingProvider === 'google' && ['SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_CANCELED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'].includes(row.googleState ?? '') && !row.paymentFailed
      && Number.isFinite(row.endDate.getTime()) && row.endDate <= now) continue;
    return row.billingProvider;
  }
  return null;
}

export async function assertNoForeignSubscription(db: Pick<Prisma.TransactionClient, 'subscription' | 'googlePlayPurchaseSync'>,
  companyId: string, target: PurchaseProvider, now = new Date()) {
  const rows = await db.subscription.findMany({
    where: { companyId, billingProvider: { not: target } },
    select: { id: true, billingProvider: true, isActive: true, paymentFailed: true, endDate: true,
      stripeSubscriptionCanceled: true, appleBillingStatus: true, plan: { select: { validityType: true } } },
  });
  const googleRows = target === 'google' ? [] : await db.googlePlayPurchaseSync.findMany({ where: { companyId, retired: false },
    select: { subscriptionId: true, state: true } });
  const provider = conflictingProvider(rows.map(row => ({ ...row,
    googleState: googleRows.find(item => item.subscriptionId === row.id)?.state })), target, now);
  if (provider) throw new SubscriptionPurchaseConflict(provider);
  // Pending Google purchases have no Subscription row yet. Keep the purchase
  // blocked until the provider confirms cancellation or completion, not a timer.
  if (target !== 'google') {
    const pending = googleRows.some(row => ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'].includes(row.state ?? ''));
    if (pending) throw new SubscriptionPurchaseConflict('google');
  }
}

// Once the store has charged, inactive history cannot justify refusing the receipt.
// Only a live contract with another provider can; FREE grants are not contracts.
export async function assertNoActiveForeignContract(db: Pick<Prisma.TransactionClient, 'subscription'>, companyId: string, target: PurchaseProvider) {
  const rows = await db.subscription.findMany({
    where: { companyId, billingProvider: { not: target }, isActive: true },
    select: { id: true, billingProvider: true, isActive: true, paymentFailed: true, endDate: true,
      stripeSubscriptionCanceled: true, appleBillingStatus: true, plan: { select: { validityType: true } } },
  });
  const provider = conflictingProvider(rows, target);
  if (provider) throw new SubscriptionPurchaseConflict(provider);
}

export async function assertNoPendingGooglePurchase(db: Pick<Prisma.TransactionClient, 'googlePlayPurchaseSync'>, companyId: string) {
  const unresolved = await db.googlePlayPurchaseSync.findFirst({ where: { companyId, retired: false,
    state: { in: ['SUBSCRIPTION_STATE_PENDING', 'SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED'] } }, select: { id: true } });
  if (unresolved) throw new SubscriptionPurchaseConflict('google');
}
