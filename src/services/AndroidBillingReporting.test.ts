import { enqueueAndroidBillingEvent, externalTransactionId, invoiceAmounts, processAndroidBillingReports } from './AndroidBillingReporting';
import { prisma } from '../utils/prisma';
import Stripe from 'stripe';

jest.mock('../utils/prisma', () => ({ prisma: { androidBillingReport: { findMany: jest.fn(), updateMany: jest.fn(), upsert: jest.fn() }, androidBillingAttempt: { findUniqueOrThrow: jest.fn() } } }));
jest.mock('../config/stripe', () => ({ stripeConfig: { getClient: jest.fn() } }));

describe('Android external billing reporting', () => {
  beforeEach(() => { jest.clearAllMocks(); process.env.ANDROID_BILLING_REPORTING_ENABLED = 'true'; });
  it('converts minor units exactly and separates tax', () => {
    expect(invoiceAmounts({ total: 3190, currency: 'usd', total_tax_amounts: [{ amount: 290 }] as Stripe.Invoice.TotalTaxAmount[] })).toEqual({
      originalPreTaxAmount: { currency: 'USD', priceMicros: '29000000' }, originalTaxAmount: { currency: 'USD', priceMicros: '2900000' },
    });
    expect(invoiceAmounts({ total: 0, currency: 'usd', total_tax_amounts: [] }).originalPreTaxAmount.priceMicros).toBe('0');
    expect(() => invoiceAmounts({ total: 100, currency: 'jpy', total_tax_amounts: [] })).toThrow();
  });
  it('uses stable opaque IDs rather than personal information', () => {
    expect(externalTransactionId('in_first')).toBe(externalTransactionId('in_first'));
    expect(externalTransactionId('in_first')).not.toBe(externalTransactionId('in_renewal'));
    expect(externalTransactionId('in_first')).toMatch(/^[a-f0-9]{64}$/);
  });
  it('does not inspect unrelated Stripe events', async () => {
    await enqueueAndroidBillingEvent({ type: 'customer.updated' } as Stripe.Event);
    expect(prisma.androidBillingReport.upsert).not.toHaveBeenCalled();
  });
  it('only one worker can claim a report', async () => {
    (prisma.androidBillingReport.findMany as jest.Mock).mockResolvedValue([{ id: 'report', status: 'pending', nextAttemptAt: new Date() }]);
    (prisma.androidBillingReport.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    await processAndroidBillingReports();
    expect(prisma.androidBillingAttempt.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it('retains failed deliveries and schedules retry without leaking the payload', async () => {
    (prisma.androidBillingReport.findMany as jest.Mock).mockResolvedValue([{ id: 'report', attemptId: 'attempt', status: 'pending', attempts: 0, nextAttemptAt: new Date(), payload: { invoice: {} } }]);
    (prisma.androidBillingReport.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.androidBillingAttempt.findUniqueOrThrow as jest.Mock).mockRejectedValue(new Error('secret-token'));
    const log = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await processAndroidBillingReports();
    const update = (prisma.androidBillingReport.updateMany as jest.Mock).mock.calls[1][0];
    expect(update.data.status).toBe('pending');
    expect(update.data.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(update.data.lastError).not.toContain('secret-token');
    log.mockRestore();
  });
});
