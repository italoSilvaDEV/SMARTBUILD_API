import { prisma } from '../utils/prisma';
import { compareSubscriptionAccess, evaluateSubscriptionAccess, ExistingAccess } from './SubscriptionAccessDecision';

type ComparisonInput = {
  consumer: 'local-status' | 'mobile-login';
  company: {
    id: string;
    allowedEmployees: number | null;
    extraEmployees: number | null;
    mobileSubscriptionStatus?: string | null;
    Plan: {
      id: string;
      validityType: string;
      validityDuration: number;
    } | null;
  };
  planPermissions: string[];
  officePermissions: string[];
  officeName?: string | null;
  legacyPlanPermissions?: boolean;
  hasCompanyAccess: boolean;
  existing: ExistingAccess;
};

// Diagnostic opt-in only. No result is returned to authorization or billing code.
// An unavailable comparison must never break the existing login/status response.
export async function observeSubscriptionAccess(input: ComparisonInput): Promise<void> {
  if (process.env.SUBSCRIPTION_ACCESS_COMPARE !== 'true') return;
  try {
    const subscriptions = await prisma.subscription.findMany({
      where: { companyId: input.company.id },
      select: {
        id: true, companyId: true, planId: true, billingProvider: true,
        startDate: true, endDate: true, isActive: true, paymentFailed: true,
        stripeSubscriptionCanceled: true, autoRenewing: true, appleBillingStatus: true,
        plan: { select: { validityType: true } },
      },
      take: 101,
      orderBy: { id: 'asc' },
    });
    if (subscriptions.length > 100) {
      console.info('[SubscriptionAccessComparison]', { consumer: input.consumer, reason: 'snapshot_limit_exceeded' });
      return; // Never decide from a truncated company history.
    }
    const candidate = evaluateSubscriptionAccess({
      companyId: input.company.id,
      plan: input.company.Plan ? { ...input.company.Plan, permissions: input.planPermissions } : null,
      allowedEmployees: input.company.allowedEmployees ?? 0,
      extraEmployees: input.company.extraEmployees ?? 0,
      officePermissions: input.officePermissions,
      officeName: input.officeName,
      legacyPlanPermissions: input.legacyPlanPermissions,
      hasCompanyAccess: input.hasCompanyAccess,
      pendingSubscription: input.company.mobileSubscriptionStatus === 'pending_subscription',
      subscriptions,
      now: new Date(),
    });
    const differences = compareSubscriptionAccess(input.existing, candidate);
    if (differences.length) {
      console.info('[SubscriptionAccessComparison]', {
        consumer: input.consumer, reason: candidate.reason, differences,
      });
    }
  } catch {
    // Do not log exceptions: Prisma/provider errors may include customer data.
    try {
      console.warn('[SubscriptionAccessComparison]', { consumer: input.consumer, reason: 'comparison_unavailable' });
    } catch { /* Diagnostics must not change the request outcome. */ }
  }
}
