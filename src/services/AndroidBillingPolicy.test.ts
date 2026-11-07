import { getAndroidBillingProgram, hasGoogleSubscriptionAccess, isAndroidBillingEnabled, parseAndroidPlanMappings } from './AndroidBillingPolicy';

describe('Android billing policy', () => {
  const now = new Date('2026-11-05T12:00:00Z');
  const future = '2026-12-05T12:00:00Z';

  it('retains paid access after cancellation until the period expires', () => {
    expect(hasGoogleSubscriptionAccess('SUBSCRIPTION_STATE_CANCELED', future, now)).toBe(true);
    expect(hasGoogleSubscriptionAccess('SUBSCRIPTION_STATE_CANCELED', now.toISOString(), now)).toBe(false);
  });

  it('keeps grace-period access and rejects held, pending, paused and invalid purchases', () => {
    expect(hasGoogleSubscriptionAccess('SUBSCRIPTION_STATE_IN_GRACE_PERIOD', future, now)).toBe(true);
    for (const state of ['ON_HOLD', 'PENDING', 'PAUSED', 'EXPIRED']) {
      expect(hasGoogleSubscriptionAccess(`SUBSCRIPTION_STATE_${state}`, future, now)).toBe(false);
    }
    expect(hasGoogleSubscriptionAccess('SUBSCRIPTION_STATE_ACTIVE', 'invalid', now)).toBe(false);
  });
  it('selects the approved regional program using the Google Play country', () => {
    expect(getAndroidBillingProgram('BR')).toBe('user-choice-billing');
    expect(getAndroidBillingProgram('US')).toBe('external-content-link');
    expect(() => getAndroidBillingProgram('PT')).toThrow();
    expect(() => getAndroidBillingProgram('pt-BR')).toThrow();
  });

  it('requires both release activation and regional approval', () => {
    expect(isAndroidBillingEnabled('BR', {})).toBe(false);
    expect(isAndroidBillingEnabled('BR', { ANDROID_BILLING_ENABLED: 'true' })).toBe(false);
    const environment = { ANDROID_BILLING_ENABLED: 'true', ANDROID_BILLING_BR_APPROVED: 'true' };
    expect(isAndroidBillingEnabled('BR', environment)).toBe(true);
    expect(isAndroidBillingEnabled('US', environment)).toBe(false);
  });

  it('requires unambiguous plan mappings instead of inferring a plan from its price', () => {
    const monthly = { planId: 'monthly', productId: 'starter_monthly', basePlanId: 'monthly' };
    expect(parseAndroidPlanMappings(JSON.stringify([monthly]))).toEqual([monthly]);
    expect(() => parseAndroidPlanMappings(JSON.stringify([monthly, { ...monthly, planId: 'annual' }]))).toThrow();
    expect(() => parseAndroidPlanMappings(JSON.stringify([{ ...monthly, basePlanId: '' }]))).toThrow();
    expect(() => parseAndroidPlanMappings('{}')).toThrow();
  });
});

it('native billing disables the old regional checkout even with approvals',()=>{expect(isAndroidBillingEnabled('BR',{GOOGLE_PLAY_NATIVE_ENABLED:'true',ANDROID_BILLING_ENABLED:'true',ANDROID_BILLING_BR_APPROVED:'true'})).toBe(false);});
