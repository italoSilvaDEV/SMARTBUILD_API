import { observeSubscriptionAccess } from './SubscriptionAccessComparison';
import { prisma } from '../utils/prisma';

jest.mock('../utils/prisma', () => ({ prisma: { subscription: { findMany: jest.fn() } } }));

const input: Parameters<typeof observeSubscriptionAccess>[0] = {
  consumer: 'local-status',
  company: { id: 'company-a', allowedEmployees: 2, extraEmployees: 0, Plan: { id: 'plan-a', validityType: 'ANNUAL', validityDuration: 1 } },
  planPermissions: ['invoices'], officePermissions: ['invoices'], hasCompanyAccess: true,
  existing: { subscriptionId: 'sub-a', planId: 'plan-a', isExpired: false, paymentFailed: false, stripeSubscriptionCanceled: false, permissions: ['invoices'], seatLimit: 2 },
};
const row = {
  id: 'sub-a', companyId: 'company-a', planId: 'plan-a', billingProvider: 'stripe',
  startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), isActive: true,
  paymentFailed: false, stripeSubscriptionCanceled: false,
};

describe('read-only subscription observation', () => {
  const previousFlag = process.env.SUBSCRIPTION_ACCESS_COMPARE;
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-06T15:00:00Z'));
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    delete process.env.SUBSCRIPTION_ACCESS_COMPARE;
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (previousFlag === undefined) delete process.env.SUBSCRIPTION_ACCESS_COMPARE;
    else process.env.SUBSCRIPTION_ACCESS_COMPARE = previousFlag;
  });
  it('performs no query or logging by default', async () => {
    await observeSubscriptionAccess(input);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
  it('does not log matching results or change caller data', async () => {
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([row]);
    const before = JSON.stringify(input);
    await expect(observeSubscriptionAccess(input)).resolves.toBeUndefined();
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { companyId: 'company-a' }, take: 101 }));
    expect(console.info).not.toHaveBeenCalled();
    expect(JSON.stringify(input)).toBe(before);
  });
  it('reports differing fields without customer or receipt identifiers', async () => {
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([row]);
    await observeSubscriptionAccess({ ...input, consumer: 'mobile-login', existing: { ...input.existing, isExpired: true } });
    expect(console.info).toHaveBeenCalledWith('[SubscriptionAccessComparison]', {
      consumer: 'mobile-login', reason: 'confirmed_local_access', differences: ['access'],
    });
    expect(JSON.stringify((console.info as jest.Mock).mock.calls)).not.toContain('company-a');
  });
  it('does not throw or expose the underlying database error', async () => {
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    (prisma.subscription.findMany as jest.Mock).mockRejectedValue(new Error('sensitive database details'));
    await expect(observeSubscriptionAccess(input)).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('[SubscriptionAccessComparison]', { consumer: 'local-status', reason: 'comparison_unavailable' });
    expect(JSON.stringify((console.warn as jest.Mock).mock.calls)).not.toContain('sensitive');
  });
  it('does not decide from an incomplete history', async () => {
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue(Array.from({ length: 101 }, (_, n) => ({ ...row, id: String(n) })));
    await observeSubscriptionAccess(input);
    expect(console.info).toHaveBeenCalledWith('[SubscriptionAccessComparison]', { consumer: 'local-status', reason: 'snapshot_limit_exceeded' });
  });
  it('still resolves if diagnostic logging fails', async () => {
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    (prisma.subscription.findMany as jest.Mock).mockRejectedValue(new Error('db failed'));
    (console.warn as jest.Mock).mockImplementation(() => { throw new Error('logger failed'); });
    await expect(observeSubscriptionAccess(input)).resolves.toBeUndefined();
  });
});
