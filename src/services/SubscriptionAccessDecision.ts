import { resolveEffectivePermissions } from '../utils/planPermissions';

// Pure company-level decision shared by local web status and mobile authentication.
export type AccessState = 'active' | 'trial' | 'grace' | 'non_renewing' | 'pending' | 'suspended' | 'expired' | 'revoked';
export type SubscriptionSnapshot = {
  id: string;
  companyId: string;
  planId: string;
  billingProvider: string;
  plan?: { validityType: string } | null;
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
  legacyPlanPermissions?: boolean;
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

// A current subscription cannot authorize the unrelated plan stored on a company.
// This detects an inconsistency only; it never chooses or persists a replacement.
export function hasSubscriptionPlanConflict(
  companyId: string,
  planId: string | null | undefined,
  subscription: { companyId: string; planId: string; isActive: boolean } | null | undefined,
) {
  return Boolean(subscription?.isActive && subscription.companyId === companyId && subscription.planId !== planId);
}

// Paying during a FREE grant leaves both rows active until the grant ends. Only the paid
// contract already applied to the company supersedes it; rows of unknown type stay conflicts.
function withoutSupersededFree<T extends SubscriptionSnapshot>(rows: readonly T[], companyPlanId?: string | null) {
  const paidApplied = rows.some(row => row.isActive && row.plan && row.plan.validityType !== 'FREE' && row.planId === companyPlanId);
  return paidApplied ? rows.filter(row => !(row.isActive && row.plan?.validityType === 'FREE')) : [...rows];
}

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
    // Match the existing paid Stripe web status: local expiry alone is not authoritative.
    // Financial ambiguity still requires review; no provider state is inferred here.
    if (row.paymentFailed || row.stripeSubscriptionCanceled) return 'review';
    return 'allow';
  }
  if (row.billingProvider === 'apple' || row.billingProvider === 'google') {
    if (row.appleBillingStatus === 'refunded' || row.appleBillingStatus === 'expired') return 'deny';
    if (end <= now) return 'deny';
    if (row.billingProvider === 'apple' && row.appleBillingStatus === 'grace') return 'allow'; // Persisted only with the provider-confirmed grace end.
    if (row.paymentFailed) return 'review'; // A boolean alone is not evidence of grace.
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
      ? resolveEffectivePermissions(input.plan.permissions, input.officePermissions, input.officeName, input.legacyPlanPermissions) : [],
    seatLimit: input.allowedEmployees + input.extraEmployees,
    autoRenewing: row?.autoRenewing ?? null,
    paymentFailed: decision === 'allow' && row && hasConfirmedStoreGrace(row) ? false : row?.paymentFailed ?? false,
  });
  if (!input.hasCompanyAccess) return result('deny', 'company_access_required');
  if (!input.plan) return result('deny', 'plan_missing');
  if (!Number.isFinite(input.now.getTime()) || ![input.allowedEmployees, input.extraEmployees].every(n => Number.isInteger(n) && n >= 0)) {
    return result('review', 'invalid_snapshot');
  }
  const rows = withoutSupersededFree(input.subscriptions.filter(row => row.companyId === input.companyId
    && !(row.plan?.validityType === 'FREE' && row.endDate.getTime() <= input.now.getTime())), input.plan.id);
  if (new Set(rows.map(row => row.id)).size !== rows.length) return result('review', 'duplicate_snapshot');
  // A local expiry is not proof that a second active billing record was closed.
  if (rows.filter(row => row.isActive).length > 1) return result('review', 'multiple_subscriptions');
  const evaluated = rows.map(row => ({ row, decision: evaluateRow(row, input.plan!.validityType === 'FREE', input.now.getTime()) }));
  const candidates = evaluated.filter(item => item.decision !== 'deny');
  if (input.pendingSubscription && !candidates.length) {
    return result('deny', 'pending_subscription');
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

function hasConfirmedStoreGrace(row: SubscriptionSnapshot) {
  return row.billingProvider !== 'stripe' && (row.confirmedState === 'grace'
    || row.billingProvider === 'apple' && row.appleBillingStatus === 'grace');
}

// Compatibility projection for existing consumers. No database/provider calls or writes.
// Stripe financial flags remain separate from isExpired, exactly as in the web contract.
export function resolveCompanySubscriptionStatus<T extends SubscriptionSnapshot>(input: {
  companyId: string;
  plan: AccessInput['plan'];
  allowedEmployees: number;
  extraEmployees: number;
  pendingSubscription: boolean;
  subscriptions: readonly T[];
  now: Date;
}) {
  const active = withoutSupersededFree(input.subscriptions.filter(row => row.companyId === input.companyId && row.isActive
    && !(row.plan?.validityType === 'FREE' && row.endDate.getTime() <= input.now.getTime())), input.plan?.id);
  const detected = active.length > 1 ? 'multiple_subscriptions'
    : hasSubscriptionPlanConflict(input.companyId, input.plan?.id, active[0])
      ? 'company_subscription_plan_mismatch' : null;
  // Production (101d8b4) reads the newest active row and never compares it with Company.planId,
  // so existing companies in either state keep working and the conflict is only reported.
  // Pending signups and companies without a plan were already blocked there and stay blocked.
  const tolerated = !!detected && !!input.plan && !input.pendingSubscription;
  const byStart = [...active].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  const newest = byStart.find(row => row.startDate.getTime() <= input.now.getTime()) ?? byStart[0] ?? null;
  const subscription = tolerated ? newest : active.length === 1 ? active[0] : null;
  const access = evaluateSubscriptionAccess({ ...input,
    subscriptions: tolerated && newest ? [{ ...newest, planId: input.plan!.id }] : active,
    hasCompanyAccess: true, officePermissions: [], officeName: 'Owner' });
  const conflict = tolerated ? null : detected;
  const paid = input.plan && input.plan.validityType !== 'FREE';
  const stripeFinancialReview = paid && subscription?.billingProvider === 'stripe'
    && !subscription.confirmedState && access.reason === 'provider_or_legacy_state_required'
    && (subscription.paymentFailed || subscription.stripeSubscriptionCanceled)
    && Number.isFinite(subscription.startDate.getTime()) && Number.isFinite(subscription.endDate.getTime())
    && subscription.endDate >= subscription.startDate && subscription.startDate <= input.now;
  const isExpired = !!conflict || (access.decision !== 'allow' && !(stripeFinancialReview && !input.pendingSubscription));
  const accessIssue = conflict || (access.decision === 'review' && !stripeFinancialReview ? access.reason : null);
  return {
    subscription, access, accessIssue, isExpired, billingReview: tolerated ? detected : null,
    paymentFailed: paid && subscription
      ? (hasConfirmedStoreGrace(subscription) && access.decision === 'allow'
        ? false : subscription.paymentFailed)
      : false,
    stripeSubscriptionCanceled: paid && subscription?.billingProvider === 'stripe' ? subscription.stripeSubscriptionCanceled : false,
    permissions: isExpired ? [] : input.plan?.permissions ?? [],
  };
}
