import { resolveCompanySubscriptionStatus } from '../../services/SubscriptionAccessDecision';
import { prisma } from '../../utils/prisma';
import { stripeConfig } from '../../config/stripe';
import { StripeWebHooksController } from './WebHookController';

jest.mock('../../config/stripe', () => {
  const client = { checkout: { sessions: { list: jest.fn() } }, subscriptions: { update: jest.fn() } };
  return { stripeConfig: { getClient: () => client } };
});
jest.mock('../../utils/prisma', () => ({
  prisma: {
    plan: { findFirst: jest.fn(), findUnique: jest.fn() },
    company: { findUnique: jest.fn(), update: jest.fn() },
    subscription: { create: jest.fn() },
    office: { findMany: jest.fn() },
  },
}));
jest.mock('../../services/StripeSubscriptionItemService', () => ({ StripeSubscriptionItemService: class {} }));
jest.mock('../../utils/ownerFullAccess', () => ({ grantOwnerFullAccessForCompany: jest.fn() }));
jest.mock('../../services/MetaConversionsService', () => ({ sendMetaPurchaseFromCheckout: jest.fn() }));
jest.mock('../../services/AndroidBillingReporting', () => ({ enqueueAndroidBillingEvent: jest.fn() }));

const db = prisma as any;
const stripe = stripeConfig.getClient() as any;

it('Stripe checkout during a valid FREE grant leaves the company with the paid plan', async () => {
  delete process.env.BILLING_COORDINATION_ENABLED;
  const free = { id: 'trial', companyId: 'company', planId: 'free-plan', billingProvider: 'stripe', isActive: true, paymentFailed: false,
    stripeSubscriptionCanceled: false, startDate: new Date('2026-11-01'), endDate: new Date('2099-01-01'), plan: { validityType: 'FREE' } };
  const stored: any[] = [free];
  stripe.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs', subscription: 'sub_paid', metadata: { companyId: 'company' } }] });
  db.plan.findFirst.mockResolvedValue({ id: 'plan', name: 'Starter', allowedEmployees: 2 });
  db.plan.findUnique.mockResolvedValue(null);
  db.company.findUnique.mockResolvedValue({ planId: 'free-plan' });
  db.subscription.create.mockImplementation(async ({ data }: any) => { const row = { id: 'paid', billingProvider: 'stripe', ...data }; stored.push(row); return row; });
  db.office.findMany.mockResolvedValue([{ name: 'Worker' }, { name: 'Administrator' }]);

  await new StripeWebHooksController().processVerifiedEvent({
    type: 'customer.subscription.created',
    data: { object: { id: 'sub_paid', status: 'active', metadata: {}, customer: 'cus', current_period_start: 1793000000, current_period_end: 1795600000,
      items: { data: [{ price: { id: 'price_starter', metadata: {} } }] } } },
  } as any);

  expect(stored.filter(row => row.isActive)).toHaveLength(2);
  expect(db.company.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planId: 'plan' }) }));
  const status = resolveCompanySubscriptionStatus({ companyId: 'company', plan: { id: 'plan', validityType: 'MONTHLY', validityDuration: 1, permissions: ['Projects'] },
    allowedEmployees: 2, extraEmployees: 0, pendingSubscription: false, now: new Date('2026-11-09'),
    subscriptions: stored.map(row => ({ ...row, plan: row.plan ?? { validityType: 'MONTHLY' } })) });
  expect(status).toMatchObject({ isExpired: false, accessIssue: null, permissions: ['Projects'], subscription: { id: 'paid' } });
});
