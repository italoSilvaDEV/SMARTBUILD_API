import { resolveEffectivePermissions } from '../utils/planPermissions';

// TASK-219: evaluation only. Not connected to authentication or billing writes.
export type AccessState = 'active' | 'trial' | 'grace' | 'non_renewing' | 'pending' | 'suspended' | 'expired' | 'revoked';
export type SubscriptionSnapshot = {
  id: string;
  companyId: string;
  planId: string;
  billingProvider: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  paymentFailed: boolean;
  stripeSubscriptionCanceled: boolean;
  autoRenewing?: boolean | null;
  appleBillingStatus?: string | null;
  // Normalized entitlement, not raw provider status (e.g. Stripe canceled).
  // Supply only from a provider-verified server record, never request body or UI.
  confirmedState?: AccessState;
};
export type AccessInput = {
  companyId: string;
  plan: { id: string; validityType: string; validityDuration: number; permissions: string[] } | null;
  allowedEmployees: number;
  extraEmployees: number;
  officePermissions: string[];
  officeName?: string | null;
  hasCompanyAccess: boolean;
  pendingSubscription: boolean;
  subscriptions: readonly SubscriptionSnapshot[];
  now: Date;
};
export type AccessDecision = {
  decision: 'allow' | 'deny' | 'review';
  reason: string;
  subscriptionId: string | null;
  planId: string | null;
  validityType: string | null;
  validityDuration: number | null;
  permissions: string[];
  seatLimit: number;
  autoRenewing: boolean | null;
  paymentFailed: boolean;
};

function evaluateRow(row: SubscriptionSnapshot, free: boolean, now: number) {
  const start = row.startDate.getTime();
  const end = row.endDate.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 'review';
  if (start > now) return 'deny';
  if (row.confirmedState) {
    if (['pending', 'suspended', 'expired', 'revoked'].includes(row.confirmedState)) return 'deny';
    if (!['active', 'trial', 'grace', 'non_renewing'].includes(row.confirmedState)) return 'review';
    if (end <= now) return 'deny';
    // A confirmed state conflicting with the local active flag needs reconciliation.
    return row.isActive ? 'allow' : 'review';
  }
  if (!row.isActive) return 'deny';
  if (free) return end > now ? 'allow' : 'deny';
  if (row.billingProvider === 'stripe') {
    // Local flags cannot distinguish cancel-at-period-end, failure and stale state.
    // Do not silently replace the existing live Stripe lookup with a date rule.
    if (row.paymentFailed || row.stripeSubscriptionCanceled || end <= now) return 'review';
    return 'allow';
  }
  if (row.billingProvider === 'apple' || row.billingProvider === 'google') {
    if (row.appleBillingStatus === 'refunded' || row.appleBillingStatus === 'expired') return 'deny';
    if (end <= now) return 'deny';
    if (row.paymentFailed) return 'review'; // Grace versus suspension is not encoded by this boolean.
    return 'allow';
  }
  return 'review'; // Legacy paid grants require classification, not price inference.
}

export function evaluateSubscriptionAccess(input: AccessInput): AccessDecision {
  const result = (decision: AccessDecision['decision'], reason: string, row?: SubscriptionSnapshot): AccessDecision => ({
    decision, reason, subscriptionId: row?.id ?? null,
    planId: input.plan?.id ?? null,
    validityType: input.plan?.validityType ?? null,
    validityDuration: input.plan?.validityDuration ?? null,
    permissions: decision === 'allow' && input.plan
      ? resolveEffectivePermissions(input.plan.permissions, input.officePermissions, input.officeName) : [],
    seatLimit: input.allowedEmployees + input.extraEmployees,
    autoRenewing: row?.autoRenewing ?? null,
    paymentFailed: row?.paymentFailed ?? false,
  });
  if (!input.hasCompanyAccess) return result('deny', 'company_access_required');
  if (!input.plan) return result('deny', 'plan_missing');
  if (!Number.isFinite(input.now.getTime()) || ![input.allowedEmployees, input.extraEmployees].every(n => Number.isInteger(n) && n >= 0)) {
    return result('review', 'invalid_snapshot');
  }
  const rows = input.subscriptions.filter(row => row.companyId === input.companyId);
  if (new Set(rows.map(row => row.id)).size !== rows.length) return result('review', 'duplicate_snapshot');
  const evaluated = rows.map(row => ({ row, decision: evaluateRow(row, input.plan!.validityType === 'FREE', input.now.getTime()) }));
  const candidates = evaluated.filter(item => item.decision !== 'deny');
  if (input.pendingSubscription) {
    return result(candidates.length ? 'review' : 'deny', candidates.length ? 'pending_conflicts_with_subscription' : 'pending_subscription');
  }
  if (candidates.length > 1) return result('review', 'multiple_subscriptions');
  const candidate = candidates[0];
  if (!candidate) return result('deny', 'no_current_subscription');
  if (candidate.row.planId !== input.plan.id) return result('review', 'company_subscription_plan_mismatch', candidate.row);
  if (candidate.decision === 'review') return result('review', 'provider_or_legacy_state_required', candidate.row);
  return result('allow', 'confirmed_local_access', candidate.row);
}

export type ExistingAccess = {
  subscriptionId: string | null;
  planId: string | null;
  isExpired: boolean;
  paymentFailed: boolean;
  stripeSubscriptionCanceled: boolean;
  permissions: readonly string[];
  seatLimit: number;
};

// Receives the consumer's actual old response. No duplicate implementation of its rules.
// Returns field names only; no receipts, credentials or customer data in diagnostic logs.
export function compareSubscriptionAccess(existing: ExistingAccess, candidate: AccessDecision): string[] {
  const differences: string[] = [];
  if (candidate.decision === 'review') differences.push('manual_review_required');
  const previousAllowed = !existing.isExpired && !existing.paymentFailed && !existing.stripeSubscriptionCanceled;
  if (candidate.decision !== 'review' && previousAllowed !== (candidate.decision === 'allow')) differences.push('access');
  if (existing.planId !== candidate.planId) differences.push('planId');
  if (existing.subscriptionId !== candidate.subscriptionId) differences.push('subscriptionId');
  if (existing.seatLimit !== candidate.seatLimit) differences.push('seatLimit');
  if (existing.paymentFailed !== candidate.paymentFailed) differences.push('paymentFailed');
  if (JSON.stringify([...new Set(existing.permissions)].sort()) !== JSON.stringify([...new Set(candidate.permissions)].sort())) differences.push('permissions');
  return differences;
}

export function resolveMappedStorePlan(productId: string, mappings: readonly { productId: string; planId: string }[]) {
  const matches = mappings.filter(mapping => mapping.productId === productId);
  if (matches.length !== 1 || !matches[0].planId.trim()) return null;
  return matches[0].planId;
}
