import { describe, expect, it } from '@jest/globals';
import { AccessInput, AccessState, compareSubscriptionAccess, evaluateSubscriptionAccess, resolveMappedStorePlan, SubscriptionSnapshot } from './SubscriptionAccessDecision';

const now = new Date('2026-11-06T15:00:00Z');
const row: SubscriptionSnapshot = {
  id: 'subscription-a', companyId: 'company-a', planId: 'plan-annual', billingProvider: 'stripe',
  startDate: new Date('2026-01-01T00:00:00Z'), endDate: new Date('2027-01-01T00:00:00Z'),
  isActive: true, paymentFailed: false, stripeSubscriptionCanceled: false, autoRenewing: true,
};
const input: AccessInput = {
  companyId: 'company-a', plan: { id: 'plan-annual', validityType: 'ANNUAL', validityDuration: 1, permissions: ['invoices', 'estimates'] },
  allowedEmployees: 2, extraEmployees: 1, officePermissions: ['invoices', 'payroll'], officeName: 'Worker',
  hasCompanyAccess: true, pendingSubscription: false, subscriptions: [row], now,
};
const evaluate = (patch: Partial<SubscriptionSnapshot>) => evaluateSubscriptionAccess({ ...input, subscriptions: [{ ...row, ...patch }] });

describe('company subscription decision with offline snapshots', () => {
  it('preserves the annual contract, company seats and role/plan intersection', () => {
    expect(evaluateSubscriptionAccess(input)).toMatchObject({ decision: 'allow', planId: 'plan-annual', validityType: 'ANNUAL', validityDuration: 1, seatLimit: 3, permissions: ['invoices'] });
  });
  it.each<[string, number]>([['MONTHLY', 3], ['CUSTOM', 4], ['ANNUAL', 1]])('does not convert period %s/%s into a mobile monthly plan', (validityType, validityDuration) => {
    expect(evaluateSubscriptionAccess({ ...input, plan: { ...input.plan!, validityType, validityDuration } })).toMatchObject({ decision: 'allow', validityType, validityDuration });
  });
  it.each(['stripe', 'apple', 'google'])('does not revoke the paid period when %s auto-renew is disabled', billingProvider => {
    expect(evaluate({ billingProvider, autoRenewing: false })).toMatchObject({ decision: 'allow', autoRenewing: false });
  });
  it('does not let another company grant access', () => {
    expect(evaluate({ companyId: 'company-b' }).decision).toBe('deny');
    expect(evaluateSubscriptionAccess({ ...input, hasCompanyAccess: false }).permissions).toEqual([]);
  });
  it('ignores a newer inactive record, regardless of input ordering', () => {
    const inactive = { ...row, id: 'inactive', startDate: new Date('2026-11-01'), isActive: false };
    for (const subscriptions of [[row, inactive], [inactive, row]]) {
      expect(evaluateSubscriptionAccess({ ...input, subscriptions })).toMatchObject({ decision: 'allow', subscriptionId: row.id });
    }
  });
  it('does not choose a winner between simultaneous subscriptions', () => {
    expect(evaluateSubscriptionAccess({ ...input, subscriptions: [row, { ...row, id: 'other', billingProvider: 'google' }] }))
      .toMatchObject({ decision: 'review', reason: 'multiple_subscriptions', permissions: [] });
  });
  it('flags mismatched company and subscription plans instead of granting higher permissions', () => {
    expect(evaluate({ planId: 'more-expensive' }).reason).toBe('company_subscription_plan_mismatch');
  });
  it.each(['pending', 'suspended', 'expired', 'revoked'] as AccessState[])('denies verified state %s even if the local active flag is stale', confirmedState => {
    expect(evaluate({ billingProvider: 'google', confirmedState }).decision).toBe('deny');
  });
  it.each(['active', 'trial', 'grace', 'non_renewing'] as AccessState[])('uses confirmed entitlement %s until its verified end date', confirmedState => {
    expect(evaluate({ billingProvider: 'google', confirmedState, paymentFailed: confirmedState === 'grace' }).decision).toBe('allow');
    expect(evaluate({ billingProvider: 'google', confirmedState, endDate: now }).decision).toBe('deny');
  });
  it('does not infer grace from a paymentFailed boolean', () => {
    expect(evaluate({ billingProvider: 'apple', paymentFailed: true }).decision).toBe('review');
  });
  it('preserves paid Stripe active state despite local expiry, but keeps financial ambiguity under review', () => {
    expect(evaluate({ endDate: now }).decision).toBe('allow');
    expect(evaluate({ endDate: new Date('2026-10-01') }).decision).toBe('allow');
    expect(evaluate({ paymentFailed: true, endDate: now }).decision).toBe('review');
    expect(evaluate({ stripeSubscriptionCanceled: true }).decision).toBe('review');
  });
  it('retains valid stored entitlement without depending on a network request', () => {
    expect(evaluate({ billingProvider: 'apple', confirmedState: 'active' }).decision).toBe('allow');
    expect(evaluate({ billingProvider: 'apple', confirmedState: 'active', endDate: now }).decision).toBe('deny');
  });
  it('requires review of an inactive row that contradicts confirmed current access', () => {
    expect(evaluate({ isActive: false, confirmedState: 'active' }).decision).toBe('review');
  });
  it('does not invent a subscription for a pending registration', () => {
    expect(evaluateSubscriptionAccess({ ...input, pendingSubscription: true, subscriptions: [] }).decision).toBe('deny');
    expect(evaluateSubscriptionAccess({ ...input, pendingSubscription: true }).decision).toBe('allow');
  });
  it('keeps a dated FREE grant valid and expires it at the boundary', () => {
    const free = { ...input, plan: { ...input.plan!, validityType: 'FREE' } };
    expect(evaluateSubscriptionAccess(free).decision).toBe('allow');
    expect(evaluateSubscriptionAccess({ ...free, subscriptions: [{ ...row, endDate: now }] }).decision).toBe('deny');
  });
  it('requires classification of unknown paid legacy grants', () => {
    expect(evaluate({ billingProvider: 'legacy' }).decision).toBe('review');
  });
  it('handles invalid dates, future subscriptions and absent plans explicitly', () => {
    expect(evaluate({ endDate: new Date('invalid') }).decision).toBe('review');
    expect(evaluate({ startDate: new Date('2026-12-01') }).decision).toBe('deny');
    expect(evaluateSubscriptionAccess({ ...input, plan: null }).decision).toBe('deny');
    expect(evaluateSubscriptionAccess({ ...input, extraEmployees: -1 }).decision).toBe('review');
  });
  it('does not mutate input snapshots', () => {
    const before = JSON.stringify(input);
    evaluateSubscriptionAccess(input);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('requires review for duplicate rows or an unrecognized normalized state', () => {
    expect(evaluateSubscriptionAccess({ ...input, subscriptions: [row, row] }).reason).toBe('duplicate_snapshot');
    expect(evaluate({ confirmedState: 'unexpected' as AccessState }).decision).toBe('review');
  });
});

describe('comparison and manual product mapping', () => {
  const existing = { subscriptionId: row.id, planId: row.planId, isExpired: false, paymentFailed: false, stripeSubscriptionCanceled: false, permissions: ['invoices'], seatLimit: 3 };
  it('reports no difference for a matching existing response', () => {
    expect(compareSubscriptionAccess(existing, evaluateSubscriptionAccess(input))).toEqual([]);
  });
  it('identifies a mobile expired response differing from the valid company snapshot', () => {
    expect(compareSubscriptionAccess({ ...existing, isExpired: true }, evaluateSubscriptionAccess(input))).toEqual(['access']);
  });
  it('reports review explicitly instead of treating ambiguity as expiration', () => {
    expect(compareSubscriptionAccess(existing, evaluate({ paymentFailed: true }))).toContain('manual_review_required');
  });
  it('reports plan, subscription, permissions and limit divergences separately', () => {
    expect(compareSubscriptionAccess({ ...existing, subscriptionId: 'other', planId: 'other', permissions: ['payroll'], seatLimit: 6 }, evaluateSubscriptionAccess(input)))
      .toEqual(['planId', 'subscriptionId', 'seatLimit', 'permissions']);
  });
  it('does not infer product mappings by price, name or a default plan', () => {
    const mappings = [{ productId: 'known', planId: 'internal' }];
    expect(resolveMappedStorePlan('known', mappings)).toBe('internal');
    expect(resolveMappedStorePlan('unknown_29', mappings)).toBeNull();
    expect(resolveMappedStorePlan('known', [...mappings, ...mappings])).toBeNull();
    expect(resolveMappedStorePlan('known', [{ productId: 'known', planId: ' ' }])).toBeNull();
  });
});
