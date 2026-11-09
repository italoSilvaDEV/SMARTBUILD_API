import { prisma } from '../utils/prisma';
import { canAccessCompanySubscription, canUseCompanyFeature } from './CompanyFeatureAccess';

jest.mock('../utils/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() }, company: { findUnique: jest.fn() }, subscription: { findMany: jest.fn() } },
}));

const db = prisma as any;
const trial = { id: 'trial', companyId: 'company', planId: 'free-plan', billingProvider: 'stripe', isActive: true, paymentFailed: false,
  stripeSubscriptionCanceled: false, startDate: new Date('2026-11-01'), endDate: new Date('2099-01-01'), plan: { validityType: 'FREE' } };
const paid = { ...trial, id: 'paid', planId: 'plan', startDate: new Date('2026-10-01'), plan: { validityType: 'MONTHLY' } };

function useRows(rows: any[]) {
  db.subscription.findMany.mockImplementation(async ({ take }: any) => rows.slice(0, take));
}

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ isDisabled: false, company_id: 'company', companies: [],
    office: { name: 'Owner', company_id: 'company', legacyPlanPermissions: false, userPermissions: [] } });
  db.company.findUnique.mockResolvedValue({ allowedEmployees: 2, extraEmployees: 0, mobileSubscriptionStatus: 'active',
    Plan: { id: 'plan', validityType: 'MONTHLY', validityDuration: 1, permissionGroup: { GroupPermissionsList: [{ Permissions: { description: 'Projects' } }] } } });
});

const plan = (permissions: string[]) => ({ id: 'plan', validityType: 'MONTHLY', validityDuration: 1, permissionGroup: { GroupPermissionsList: permissions.map(description => ({ Permissions: { description } })) } });
const useActor = (office: object, patch: object = {}) => db.user.findUnique.mockResolvedValue({ isDisabled: false, company_id: 'company', companies: [], office: { name: 'Worker', company_id: 'company', legacyPlanPermissions: false, userPermissions: [], ...office }, ...patch });
const usePlan = (permissions: string[] | null) => db.company.findUnique.mockResolvedValue({ allowedEmployees: 2, extraEmployees: 0, mobileSubscriptionStatus: 'active', Plan: permissions ? plan(permissions) : null });
const stripePaid = { ...paid, id: 'stripe' };

describe('R3: financial state of an active Stripe contract does not deny modules', () => {
  it.each([['paymentFailed', { paymentFailed: true }], ['stripeSubscriptionCanceled', { stripeSubscriptionCanceled: true }]])('%s keeps the modules the status already reports as available', async (_name, patch) => {
    useRows([{ ...stripePaid, ...patch }]);
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(true);
    await expect(canAccessCompanySubscription('user', 'company')).resolves.toBe(true);
  });
});

describe('R4: subscription state adds no block; identity, company, role and plan still decide', () => {
  it.each([['no active row', []], ['ended contract', [{ ...stripePaid, isActive: false, stripeSubscriptionCanceled: true }]]])('%s keeps legitimate use', async (_name, rows) => {
    useRows(rows as any[]);
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(true);
    await expect(canAccessCompanySubscription('user', 'company')).resolves.toBe(true);
  });
  it('a worker assigned on an expired company keeps Crew access', async () => {
    useRows([]); useActor({ name: 'Worker' });
    await expect(canAccessCompanySubscription('user', 'company')).resolves.toBe(true);
  });
  it('a feature outside the plan stays denied on an expired company', async () => {
    useRows([]);
    await expect(canUseCompanyFeature('user', 'company', 'Payroll')).resolves.toBe(false);
  });
  it('a role without the feature stays denied on an expired company', async () => {
    useRows([]); useActor({ name: 'Sales', userPermissions: [{ permission: { description: 'Invoice' } }] }); usePlan(['Projects', 'Invoice']);
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
    await expect(canUseCompanyFeature('user', 'company', 'Invoice')).resolves.toBe(true);
  });
  it('a new role with no permissions gains nothing from an expired company', async () => {
    useRows([]); useActor({ name: 'Worker' });
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
  });
  it('a member of another company stays denied', async () => {
    useRows([]); useActor({ company_id: 'other' }, { company_id: 'other', companies: [] });
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
    await expect(canAccessCompanySubscription('user', 'company')).resolves.toBe(false);
  });
  it('a disabled user stays denied', async () => {
    useRows([]); useActor({ name: 'Owner' }, { isDisabled: true });
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
    await expect(canAccessCompanySubscription('user', 'company')).resolves.toBe(false);
  });
  it('an office of another company stays denied unless explicitly legacy', async () => {
    useRows([]); useActor({ name: 'Owner', company_id: 'other' });
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
  });
  describe('company without a plan', () => {
    it('keeps Owner and Administrator working', async () => {
      useRows([]); usePlan(null); useActor({ name: 'Owner' });
      await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(true);
    });
    it('honors explicit role permissions', async () => {
      useRows([]); usePlan(null); useActor({ name: 'Sales', userPermissions: [{ permission: { description: 'Invoice' } }] });
      await expect(canUseCompanyFeature('user', 'company', 'Invoice')).resolves.toBe(true);
      await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
    });
    it('does not turn an empty new role into full access', async () => {
      useRows([]); usePlan(null); useActor({ name: 'Worker' });
      await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(false);
    });
  });
});

describe('route guards with a FREE grant alongside a paid contract', () => {
  it('allows features of the paid contract applied to the company', async () => {
    useRows([trial, paid]);
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(true);
  });
  // R4: the conflict between two paid contracts is reported by the status response.
  it('a second paid contract adds no route block', async () => {
    useRows([trial, paid, { ...paid, id: 'paid-2', billingProvider: 'apple' }]);
    await expect(canUseCompanyFeature('user', 'company', 'Projects')).resolves.toBe(true);
  });
  it('denies a feature outside the paid plan', async () => {
    useRows([trial, paid]);
    await expect(canUseCompanyFeature('user', 'company', 'Payroll')).resolves.toBe(false);
  });
});
