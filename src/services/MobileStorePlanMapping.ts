// Existing Apple products classified from the VPS report and the HML catalog on 2026-11-06.
// These are explicit catalog identities, not an inference from price/name/order.
export const LEGACY_APPLE_PLAN_MAPPINGS: Readonly<Record<string, string>> = {
  smartbuild_pro_monthly_29: '4ee81776-538a-4e45-99eb-c7d32fcadc16',
  smartbuild_pro_monthly_99: 'd52f1833-119d-4024-beb9-7fa767ce23b7',
};

export function resolveApplePlanId(input: {
  productId?: string;
  configuredProducts: readonly { productId: string; planId?: string | null }[];
  legacyProductId?: string;
  legacyPlanId?: string;
}): string {
  const { productId } = input;
  if (!productId?.trim()) throw new Error('Store product is required.');
  const matches = input.configuredProducts.filter(item => item.productId.trim() === productId);
  if (matches.length > 1) throw new Error('Store product has duplicate plan mappings.');
  const configured = matches[0]?.planId;
  if (typeof configured === 'string') {
    if (!configured.trim()) throw new Error('Store product plan mapping is empty.');
    return configured.trim();
  }
  // A global legacy plan is scoped to its explicitly configured product, never every product.
  if (input.legacyProductId === productId && input.legacyPlanId?.trim()) return input.legacyPlanId.trim();
  const legacy = Object.prototype.hasOwnProperty.call(LEGACY_APPLE_PLAN_MAPPINGS, productId)
    ? LEGACY_APPLE_PLAN_MAPPINGS[productId] : undefined;
  if (legacy) return legacy;
  throw new Error('Store product does not have an explicit plan mapping.');
}
