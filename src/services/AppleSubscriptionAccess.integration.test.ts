import { refreshAppleBillingStatus } from './AppleBillingStatusService';
import { prisma } from '../utils/prisma';
import { resolveCompanySubscriptionStatus } from './SubscriptionAccessDecision';

jest.mock('../utils/prisma', () => ({ prisma: { subscription: { findUnique: jest.fn(), update: jest.fn() } } }));
jest.mock('jsonwebtoken', () => ({ __esModule: true, default: { sign: jest.fn(() => 'test-only') } }));

const now = new Date('2026-11-06T18:00:00Z');
const original = { id: 'sub', companyId: 'company', planId: 'plan', billingProvider: 'apple',
  startDate: new Date('2026-10-01'), endDate: new Date(now.getTime() + 3600000),
  storeOriginalTransactionId: 'original', isActive: true, paymentFailed: false,
  stripeSubscriptionCanceled: false, autoRenewing: true };
const signed = (body: object) => 'header.' + Buffer.from(JSON.stringify(body)).toString('base64url') + '.fixture';

describe('provider-verified Apple status feeds company access without live requests', () => {
  const env = { ...process.env };
  beforeEach(() => {
    jest.clearAllMocks(); jest.useFakeTimers().setSystemTime(now);
    process.env.APP_STORE_ISSUER_ID = 'fixture'; process.env.APP_STORE_KEY_ID = 'fixture';
    process.env.APP_STORE_PRIVATE_KEY = 'fixture'; process.env.APP_STORE_BUNDLE_ID = 'test.bundle';
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ ...original });
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); process.env = { ...env }; });
  function response(status: number, graceEnd?: number, transactionPatch: object = {}) {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => ({
      bundleId: 'test.bundle', data: [{ lastTransactions: [{ status, originalTransactionId: 'original',
        signedTransactionInfo: signed({ bundleId: 'test.bundle', originalTransactionId: 'original',
          expiresDate: now.getTime() - 1000, purchaseDate: original.startDate.getTime(), price: 29000, ...transactionPatch }),
        signedRenewalInfo: signed({ autoRenewStatus: 1, gracePeriodExpiresDate: graceEnd }),
      }] }],
    }) } as Response);
  }
  function project(data: object) {
    return resolveCompanySubscriptionStatus({ companyId: 'company',
      plan: { id: 'plan', validityType: 'MONTHLY', validityDuration: 1, permissions: ['invoices'] },
      allowedEmployees: 2, extraEmployees: 0, pendingSubscription: false,
      subscriptions: [{ ...original, ...data }], now });
  }
  it('uses confirmed grace deadline instead of expired paid transaction; keeps financial failure in record', async () => {
    const graceEnd = now.getTime() + 86400000; response(4, graceEnd);
    expect(await refreshAppleBillingStatus('sub')).toBe('grace');
    const data = (prisma.subscription.update as jest.Mock).mock.calls[0][0].data;
    expect(data).toMatchObject({ isActive: true, paymentFailed: true, appleBillingStatus: 'grace', endDate: new Date(graceEnd) });
    expect(project(data)).toMatchObject({ isExpired: false, paymentFailed: false, permissions: ['invoices'] });
  });
  it.each([undefined, now.getTime(), now.getTime() - 1, NaN])('does not invent grace for missing/expired deadline %s', async graceEnd => {
    response(4, graceEnd); await refreshAppleBillingStatus('sub');
    const data = (prisma.subscription.update as jest.Mock).mock.calls[0][0].data;
    expect(data.isActive).toBe(false); expect(data.appleBillingStatus).toBe('payment_failed');
    expect(project(data).isExpired).toBe(true);
  });
  it.each([2, 3, 5])('terminal/retry status %s cannot reuse a future grace date', async status => {
    response(status, now.getTime() + 86400000); await refreshAppleBillingStatus('sub');
    expect(project((prisma.subscription.update as jest.Mock).mock.calls[0][0].data).isExpired).toBe(true);
  });
  it('revocation wins over active status and future paid date', async () => {
    response(1, undefined, { revocationDate: now.getTime() - 1, expiresDate: now.getTime() + 86400000 });
    await refreshAppleBillingStatus('sub');
    expect((prisma.subscription.update as jest.Mock).mock.calls[0][0].data).toMatchObject({ isActive: false, appleBillingStatus: 'refunded' });
  });
  it('provider outage does not overwrite stored rights', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('temporary outage'));
    await expect(refreshAppleBillingStatus('sub')).rejects.toThrow('temporary outage');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(project({}).isExpired).toBe(false);
  });
  it('wrong app identity cannot update subscription', async () => {
    response(1, undefined, { bundleId: 'different.bundle' });
    await expect(refreshAppleBillingStatus('sub')).rejects.toThrow('different app');
    expect(prisma.subscription.update).not.toHaveBeenCalled();
  });
});
