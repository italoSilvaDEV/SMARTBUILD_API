export type AndroidBillingProgram = 'user-choice-billing' | 'external-content-link';

export type AndroidPlanMapping = {
  planId: string;
  productId: string;
  basePlanId: string;
};

export function hasGoogleSubscriptionAccess(state: string, expiryTime: string, now = new Date()): boolean {
  const entitled = state === 'SUBSCRIPTION_STATE_ACTIVE'
    || state === 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'
    || state === 'SUBSCRIPTION_STATE_CANCELED';
  return entitled && new Date(expiryTime).getTime() > now.getTime();
}

export function getAndroidBillingProgram(country: string): AndroidBillingProgram {
  if (country === 'BR') return 'user-choice-billing';
  if (country === 'US') return 'external-content-link';
  throw new Error('Billing is not available for this Google Play country.');
}

export function isAndroidBillingEnabled(country: string, environment = process.env): boolean {
  if (environment.GOOGLE_PLAY_NATIVE_ENABLED === 'true') return false;
  const flag = country === 'BR'
    ? environment.ANDROID_BILLING_BR_APPROVED
    : country === 'US' ? environment.ANDROID_BILLING_US_APPROVED : undefined;
  return flag === 'true' && environment.ANDROID_BILLING_ENABLED === 'true';
}

// Map by immutable plan ID, never by price or translated plan name.
export function parseAndroidPlanMappings(raw: string | undefined): AndroidPlanMapping[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Android plan mappings must be an array.');
  const planIds = new Set<string>();
  const productIds = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid Android plan mapping.');
    const mapping = entry as Record<string, unknown>;
    for (const field of ['planId', 'productId', 'basePlanId']) {
      if (typeof mapping[field] !== 'string' || !mapping[field].trim()) {
        throw new Error(`Android plan mapping requires ${field}.`);
      }
    }
    const result = {
      planId: (mapping.planId as string).trim(),
      productId: (mapping.productId as string).trim(),
      basePlanId: (mapping.basePlanId as string).trim(),
    };
    // A distinct product per plan keeps receipt validation unambiguous across periods.
    if (planIds.has(result.planId) || productIds.has(result.productId)) {
      throw new Error('Android plans and Google Play products must have a one-to-one mapping.');
    }
    planIds.add(result.planId);
    productIds.add(result.productId);
    return result;
  });
}
