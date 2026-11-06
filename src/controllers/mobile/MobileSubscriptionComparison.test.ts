import { buildAuthResponse } from './MobileAuthController';
import { prisma } from '../../utils/prisma';

jest.mock('../../utils/prisma', () => ({ prisma: {
  user: { findUnique: jest.fn() }, company: { findUnique: jest.fn() },
  subscription: { findFirst: jest.fn(), findMany: jest.fn() },
} }));
jest.mock('googleapis', () => ({ google: {} }));
jest.mock('../../utils/S3/getPresignedUrl', () => ({ getPresignedUrl: jest.fn() }));
jest.mock('../../utils/ownerFullAccess', () => ({ OWNER_FULL_ACCESS_DATA: {}, grantOwnerFullAccessForCompany: jest.fn() }));
jest.mock('../../services/AppleBillingStatusService', () => ({ refreshAppleBillingStatus: jest.fn() }));

describe('mobile login keeps existing responses during subscription comparison', () => {
  const previousFlag = process.env.SUBSCRIPTION_ACCESS_COMPARE;
  const previousSecret = process.env.SECRET_JWT;
  const company = { id: 'company', name: 'Demo', allowedEmployees: 2, extraEmployees: 0, Plan: {
    id: 'annual-plan', name: 'Annual', validityType: 'ANNUAL', validityDuration: 1,
    permissionGroup: { GroupPermissionsList: [{ Permissions: { description: 'invoices' } }] },
  } };
  const subscription = {
    id: 'subscription', companyId: 'company', planId: 'annual-plan', billingProvider: 'stripe',
    isActive: true, startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'),
    paymentFailed: false, stripeSubscriptionCanceled: false,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-11-06T15:00:00Z'));
    process.env.SECRET_JWT = 'unit-test-only';
    delete process.env.SUBSCRIPTION_ACCESS_COMPARE;
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user', name: 'Demo', companies: [{ companyId: 'company', company, office: { name: 'Owner', userPermissions: [] } }] });
    (prisma.company.findUnique as jest.Mock).mockResolvedValue(company);
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(subscription);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([subscription]);
  });
  afterEach(() => {
    jest.useRealTimers(); jest.restoreAllMocks();
    if (previousFlag === undefined) delete process.env.SUBSCRIPTION_ACCESS_COMPARE;
    else process.env.SUBSCRIPTION_ACCESS_COMPARE = previousFlag;
    if (previousSecret === undefined) delete process.env.SECRET_JWT;
    else process.env.SECRET_JWT = previousSecret;
  });
  it.each(['stripe', 'apple', 'google'])('keeps the same %s login payload with comparison on/off', async billingProvider => {
    const record = { ...subscription, billingProvider };
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue(record);
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([record]);
    const original = await buildAuthResponse('user', 'company');
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    const compared = await buildAuthResponse('user', 'company');
    expect(compared).toEqual(original);
    expect(compared.user).toMatchObject({ plan: { id: 'annual-plan', validityType: 'ANNUAL' }, permissions: ['invoices'] });
  });
  it('does not interrupt login if the comparison query fails', async () => {
    const original = await buildAuthResponse('user', 'company');
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    (prisma.subscription.findMany as jest.Mock).mockRejectedValue(new Error('comparison unavailable'));
    expect(await buildAuthResponse('user', 'company')).toEqual(original);
  });
  it('preserves expired rejection and the explicit allowExpired flow', async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ ...subscription, endDate: new Date('2026-01-02') });
    for (const flag of ['false', 'true']) {
      process.env.SUBSCRIPTION_ACCESS_COMPARE = flag;
      await expect(buildAuthResponse('user', 'company')).rejects.toThrow("Your company's subscription is not active.");
      expect(await buildAuthResponse('user', 'company', true)).toMatchObject({ isExpired: true });
    }
  });
  it('does not change existing financial flags based on the candidate', async () => {
    (prisma.subscription.findFirst as jest.Mock).mockResolvedValue({ ...subscription, paymentFailed: true, stripeSubscriptionCanceled: true });
    const original = await buildAuthResponse('user', 'company');
    process.env.SUBSCRIPTION_ACCESS_COMPARE = 'true';
    expect(await buildAuthResponse('user', 'company')).toEqual(original);
  });
});
