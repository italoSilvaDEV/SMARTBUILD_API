import { createHash } from 'crypto';
import { AndroidPlanMapping } from './AndroidBillingPolicy';
export class GoogleBillingError extends Error {
    constructor(public readonly code: string, public readonly status = 409) { super(code); }
}
export const googleCompanyAccountId = (companyId: string) => createHash('sha256').update(companyId).digest('hex');
export type GooglePurchase = {
    state: string;
    active: boolean;
    pending: boolean;
    trial: boolean;
    planId: string;
    productId: string;
    basePlanId: string;
    startDate: Date;
    endDate: Date;
    autoRenewing: boolean;
    accountId?: string;
    linkedToken?: string;
    orderId: string | null;
    environment: 'sandbox' | 'production';
    needsAcknowledgement: boolean;
};
// Only server responses belong here. Client product/offer/state never confer entitlement.
export function normalizeGooglePurchase(raw: any, mappings: AndroidPlanMapping[], expectedProduct?: string, now = new Date()): GooglePurchase {
    const state = raw?.subscriptionState;
    const states = ['PENDING', 'ACTIVE', 'PAUSED', 'IN_GRACE_PERIOD', 'ON_HOLD', 'CANCELED', 'EXPIRED', 'PENDING_PURCHASE_CANCELED'];
    if (!states.some(s => state === 'SUBSCRIPTION_STATE_' + s))
        throw new GoogleBillingError('GOOGLE_STATE_UNSUPPORTED');
    const pending = state === 'SUBSCRIPTION_STATE_PENDING' || state === 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED';
    const items = raw.lineItems;
    if (!Array.isArray(items) || !items.length)
        throw new GoogleBillingError('GOOGLE_ITEM_MISSING');
    // A future deferred item is not owned yet. Never choose it just because it matches the requested SKU.
    const owned = items.filter((item: any) => item.latestSuccessfulOrderId);
    const candidates = owned.length ? owned : items.length === 1 ? items : [];
    if (candidates.length !== 1)
        throw new GoogleBillingError('GOOGLE_ITEMS_AMBIGUOUS');
    const item = candidates[0];
    const mapping = mappings.find(m => m.productId === item.productId && m.basePlanId === item.offerDetails?.basePlanId);
    if (!mapping)
        throw new GoogleBillingError('GOOGLE_PLAN_UNMAPPED');
    if (expectedProduct && expectedProduct !== mapping.productId)
        throw new GoogleBillingError('GOOGLE_PRODUCT_MISMATCH');
    const expiry = new Date(item.expiryTime || 0), start = new Date(raw.startTime || (pending ? now : NaN));
    if (!pending && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= 0 || !Number.isFinite(start.getTime())))
        throw new GoogleBillingError('GOOGLE_DATES_INVALID');
    const active = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(state) && expiry > now;
    if (!['ACKNOWLEDGEMENT_STATE_PENDING', 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'].includes(raw.acknowledgementState))
        throw new GoogleBillingError('GOOGLE_ACK_STATE_INVALID');
    return { state, active, pending, trial: active && item.offerPhase?.freeTrial != null,
        ...mapping, startDate: start, endDate: expiry, autoRenewing: item.autoRenewingPlan?.autoRenewEnabled === true,
        accountId: raw.externalAccountIdentifiers?.obfuscatedExternalAccountId,
        linkedToken: raw.linkedPurchaseToken || undefined,
        orderId: item.latestSuccessfulOrderId || raw.latestOrderId || null,
        environment: raw.testPurchase != null ? 'sandbox' : 'production',
        needsAcknowledgement: active && raw.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
    };
}
export function assertGoogleOwnership(purchase: GooglePurchase, companyId: string, previouslyBound: boolean, testCompanies: readonly string[]) {
    if (purchase.accountId ? purchase.accountId !== googleCompanyAccountId(companyId) : !previouslyBound)
        throw new GoogleBillingError('GOOGLE_COMPANY_MISMATCH', 403);
    if (purchase.environment === 'sandbox' && !testCompanies.includes(companyId))
        throw new GoogleBillingError('GOOGLE_TEST_COMPANY_REQUIRED', 403);
}
