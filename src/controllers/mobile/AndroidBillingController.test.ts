import { Request, Response } from 'express';
import { AndroidBillingController } from './AndroidBillingController';
import { prisma } from '../../utils/prisma';
import { stripeConfig } from '../../config/stripe';

jest.mock('../../utils/prisma', () => ({ prisma: { $transaction: jest.fn(), $queryRaw: jest.fn(), subscription: { findFirst: jest.fn() }, plan: { findFirst: jest.fn(), findMany: jest.fn() }, androidBillingAttempt: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() }, company: { update: jest.fn() } } }));
jest.mock('../../services/AndroidBillingAccess', () => ({
  AndroidBillingError: class extends Error { constructor(public status: number, message: string) { super(message); } },
  androidBillingAccess: jest.fn(async () => ({ userId: 'owner', companyId: 'company', company: { id: 'company', mobileSubscriptionStatus: 'pending_subscription' } })),
}));
jest.mock('./MobileAuthController', () => ({ buildAuthResponse: jest.fn() }));
jest.mock('../../services/AndroidBillingReporting', () => ({ getAndroidReplacementContext: jest.fn() }));
jest.mock('../../config/stripe', () => ({ stripeConfig: { getClient: jest.fn() } }));

describe('Android checkout', () => {
  const controller = new AndroidBillingController();
  const response = () => { const res = { setHeader: jest.fn(), json: jest.fn(), status: jest.fn() }; res.status.mockReturnValue(res); return res as unknown as Response; };
  const request = () => ({ body: { country: 'US', action: 'subscribe', planId: 'plan', externalTransactionToken: 'google-token', requestId: '12345678-1234-4234-8234-123456789abc' }, headers: {} } as Request);
  let attempt: any;
  let create: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks(); attempt = null;
    Object.assign(process.env, { ANDROID_BILLING_ENABLED: 'true', ANDROID_BILLING_US_APPROVED: 'true', ANDROID_BILLING_REPORTING_ENABLED: 'true', URL_API: 'https://api.example.com' });
    (prisma.$transaction as jest.Mock).mockImplementation(fn => fn(prisma));
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.plan.findFirst as jest.Mock).mockResolvedValue({ id: 'plan', stripePriceId: 'price_plan', validityType: 'MONTHLY' });
    (prisma.androidBillingAttempt.findUnique as jest.Mock).mockImplementation(() => Promise.resolve(attempt));
    (prisma.androidBillingAttempt.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.androidBillingAttempt.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.androidBillingAttempt.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve(attempt = { ...data, createdAt: new Date() }));
    (prisma.androidBillingAttempt.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve(Object.assign(attempt, data)));
    create = jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' });
    (stripeConfig.getClient as jest.Mock).mockReturnValue({ checkout: { sessions: { create } } });
  });
  it('uses the shared Stripe price and attaches company metadata to the subscription', async () => {
    const res = response(); await controller.checkout(request(), res);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_plan', quantity: 1 }], subscription_data: { metadata: { companyId: 'company', planId: 'plan', androidBillingAttemptId: request().body.requestId } } }), expect.anything());
    expect(res.json).toHaveBeenCalledWith({ checkoutUrl: 'https://checkout.stripe.com/test' });
    expect((prisma.androidBillingAttempt.create as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(create.mock.invocationCallOrder[0]);
  });
  it('reuses the durable idempotency key after a lost Stripe response', async () => {
    create.mockRejectedValueOnce(new Error('network timeout'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await controller.checkout(request(), response());
    await controller.checkout(request(), response());
    expect(prisma.androidBillingAttempt.create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]).toEqual(create.mock.calls[1]);
    log.mockRestore();
  });
  it('does not start a Stripe subscription when Google Play already owns it', async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ billingProvider: 'google', planId: 'plan', isActive: true });
    const res = response(); await controller.checkout(request(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(create).not.toHaveBeenCalled();
  });
  it('does not unlock a signup from a browser redirect or an unpaid subscription', async () => {
    const res = response(); const req = request(); req.body.pendingToken = 'pending';
    await controller.status(req, res);
    expect(res.json).toHaveBeenCalledWith({ state: 'pending' });
    expect(prisma.company.update).not.toHaveBeenCalled();
  });
  it('blocks checkout if transaction reporting has not been enabled', async () => {
    process.env.ANDROID_BILLING_REPORTING_ENABLED = 'false';
    const res = response(); await controller.checkout(request(), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(create).not.toHaveBeenCalled();
  });
});
