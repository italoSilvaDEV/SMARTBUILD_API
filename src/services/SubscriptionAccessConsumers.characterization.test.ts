import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import * as ts from 'typescript';
import { evaluateSubscriptionAccess, hasSubscriptionPlanConflict, resolveCompanySubscriptionStatus } from './SubscriptionAccessDecision';
import { resolveEffectivePermissions } from '../utils/planPermissions';

// Regression and characterization: execute the real status function bodies without importing
// controllers, mail clients, provider SDKs, HTTP servers or a database connection.
function extract(relative: string, name: string, method: boolean, context: object): any {
  const file = path.resolve(__dirname, '..', relative);
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const matches: ts.Node[] = [];
  const visit = (node: ts.Node) => {
    if ((method ? ts.isMethodDeclaration(node) : ts.isFunctionDeclaration(node)) && (node as any).name?.getText(source) === name) matches.push(node);
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (matches.length !== 1) throw new Error('Expected one actual status function');
  let code = matches[0].getText(source);
  if (method) code = code.replace(/^async\s+/, 'async function ');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js + '\n' + name, { ...context, Date, console });
}

describe('TASK-219 consumer regressions and remaining characterized discrepancies', () => {
  const now = new Date('2026-11-06T18:00:00Z');
  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  async function run(patch: { rows?: any[]; type?: string; pending?: boolean; plan?: boolean; role?: string; duration?: number } = {}) {
    const plan = { id: 'plan', name: 'Fixture', validityType: patch.type || 'MONTHLY', validityDuration: patch.duration ?? 1,
      permissionGroup: { GroupPermissionsList: [{ Permissions: { description: 'invoices' } }] } };
    const company = { id: 'company', Plan: patch.plan === false ? null : plan, allowedEmployees: 2, extraEmployees: 1,
      mobileSubscriptionStatus: patch.pending ? 'pending_subscription' : 'active' };
    const rows = patch.rows ?? [row()];
    const office = { name: patch.role || 'Worker', userPermissions: [{ permission: { description: 'invoices' } }, { permission: { description: 'payroll' } }] };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ company }) },
      company: { findUnique: jest.fn().mockResolvedValue(company) },
      userCompany: { findUnique: jest.fn().mockResolvedValue({ office }) },
      subscription: {
        findFirst: jest.fn(async ({ where }) => rows.filter(r => where.isActive === undefined || r.isActive === where.isActive)
          .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0] || null),
        findMany: jest.fn(async ({ where, take }) => rows.filter(r => r.companyId === where.companyId && r.isActive === where.isActive && !(where.NOT && r.plan?.validityType === 'FREE' && r.endDate <= where.NOT.endDate.lte))
          .sort((a, b) => b.startDate.getTime() - a.startDate.getTime()).slice(0, take ?? rows.length)),
      },
    };
    let observed: any, body: any;
    const web = extract('controllers/User/UserController.ts', 'getLocalSubscriptionsStatus', true, {
      prisma, resolveCompanySubscriptionStatus, resolveEffectivePermissions, evaluateSubscriptionAccess, hasSubscriptionPlanConflict, observeSubscriptionAccess: async (input: any) => { observed = input; },
    });
    const mobile = extract('controllers/mobile/MobileAuthController.ts', 'getCompanyStatus', false, { prisma, evaluateSubscriptionAccess, hasSubscriptionPlanConflict, resolveCompanySubscriptionStatus });
    const res = { json(value: any) { body = value; return this; }, status(code: number) { throw new Error(`Unexpected status ${code}`); } };
    await web({ userId: 'user', params: { userId: 'user', company_id: 'company' } }, res);
    const mobileResult = await mobile('company');
    const candidate = evaluateSubscriptionAccess({
      companyId: 'company', plan: company.Plan ? { ...plan, permissions: ['invoices'] } : null,
      allowedEmployees: 2, extraEmployees: 1, officePermissions: ['invoices', 'payroll'], officeName: 'Worker',
      hasCompanyAccess: true, pendingSubscription: !!patch.pending, subscriptions: rows, now,
    });
    return { web: body, mobile: mobileResult, candidate, observed };
  }
  function row(patch: object = {}) {
    return { id: 'sub', companyId: 'company', planId: 'plan', billingProvider: 'stripe',
      startDate: new Date('2026-01-01'), endDate: new Date('2027-01-01'), isActive: true,
      paymentFailed: false, stripeSubscriptionCanceled: false, autoRenewing: true, ...patch };
  }
  it('baseline: valid subscription preserves access, seats and permission intersection', async () => {
    const r = await run();
    expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
    expect(r.candidate).toMatchObject({ decision: 'allow', seatLimit: 3, permissions: ['invoices'] });
  });
  it('baseline: missing plan is expired in both consumers and denied by the candidate', async () => {
    const r = await run({ plan: false, rows: [] });
    expect(r.web.isExpired).toBe(true); expect(r.mobile.isExpired).toBe(true);
    expect(r.candidate.reason).toBe('plan_missing');
  });
  it.each(['MONTHLY', 'ANNUAL', 'CUSTOM'])('paid Stripe local expiry is consistent for %s', async type => {
    for (const pending of [false, true]) {
      for (const endDate of [new Date('2026-10-01'), now, new Date('2027-01-01')]) {
        const record = row({ endDate });
        const before = JSON.stringify(record);
        const r = await run({ type, pending, rows: [record] });
        expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
        expect(r.web.plan).toEqual(r.mobile.planInfo);
        expect(r.candidate.decision).toBe('allow');
        expect(r.mobile.subscription).toEqual(record);
        expect(JSON.stringify(record)).toBe(before);
      }
    }
  });
  it.each([
    { paymentFailed: true, stripeSubscriptionCanceled: false },
    { paymentFailed: false, stripeSubscriptionCanceled: true },
    { paymentFailed: true, stripeSubscriptionCanceled: true },
  ])('Stripe flags are preserved independently of local expiry: %j', async flags => {
    const r = await run({ rows: [row({ ...flags, endDate: new Date('2026-10-01') })] });
    expect(r.web).toMatchObject({ isExpired: false, ...flags });
    expect(r.mobile).toMatchObject({ isExpired: false, ...flags });
    expect(r.candidate.decision).toBe('review');
  });
  it.each(['apple', 'google', 'stripe'])('expired FREE grants still expire with provider %s', async billingProvider => {
    const r = await run({ type: 'FREE', rows: [row({ billingProvider, endDate: new Date('2026-10-01') })] });
    expect(r.web.isExpired).toBe(true); expect(r.mobile.isExpired).toBe(true);
    expect(r.candidate.decision).toBe('deny');
  });
  it.each(['stripe', 'apple', 'google'])('D2 fixed: newer inactive row cannot hide a valid %s subscription', async billingProvider => {
    const r = await run({ rows: [row({ billingProvider }), row({ id: 'newer-inactive', billingProvider, startDate: new Date('2026-10-01'), isActive: false })] });
    expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
    expect(r.web.subscription.id).toBe('sub'); expect(r.mobile.subscription.id).toBe('sub');
    expect(r.candidate).toMatchObject({ decision: 'allow', subscriptionId: 'sub' });
  });
  it('D3 fixed: inactive FREE record with future expiry grants no access', async () => {
    const r = await run({ type: 'FREE', rows: [row({ isActive: false })] });
    expect(r.web.isExpired).toBe(true); expect(r.mobile.isExpired).toBe(true);
    expect(r.mobile.subscription).toBeNull();
    expect(r.candidate.decision).toBe('deny');
  });
  it('preserves an active FREE grant with an explicitly extended expiry', async () => {
    const r = await run({ type: 'FREE', rows: [row({ endDate: new Date('2028-03-18') })] });
    expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
    expect(r.mobile.subscription.endDate.toISOString()).toBe('2028-03-18T00:00:00.000Z');
    expect(r.candidate.decision).toBe('allow');
  });
  it.each(['stripe', 'apple', 'google'])('rejects inactive-only paid %s history', async billingProvider => {
    const r = await run({ rows: [row({ billingProvider, isActive: false })] });
    expect(r.web.isExpired).toBe(true); expect(r.mobile.isExpired).toBe(true);
    expect(r.candidate.decision).toBe('deny');
  });
  it.each(['stripe', 'apple', 'google'])('pending signup cannot hide valid %s entitlement', async billingProvider => {
    const r = await run({ pending: true, rows: [row({ billingProvider })] });
    expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
    expect(r.candidate.decision).toBe('allow');
  });
  it.each([
    ['absent', []],
    ['inactive', [row({ isActive: false })]],
    ['expired', [row({ billingProvider: 'google', endDate: now })]],
    ['future', [row({ startDate: new Date('2026-12-01') })]],
    ['payment failed', [row({ paymentFailed: true })]],
    ['unknown provider', [row({ billingProvider: 'unknown' })]],
    ['plan mismatch', [row({ planId: 'another-plan' })]],
    ['refunded', [row({ billingProvider: 'apple', appleBillingStatus: 'refunded' })]],
    ['multiple', [row(), row({ id: 'second', billingProvider: 'google' })]],
  ])('pending signup remains blocked when entitlement is %s', async (_name, rows) => {
    const r = await run({ pending: true, rows: rows as any[] });
    expect(r.mobile.isExpired).toBe(true);
    expect(r.web.isExpired).toBe(true);
    expect(r.candidate.decision).not.toBe('allow');
  });
  it.each([['stripe', 'google'], ['apple', 'google'], ['stripe', 'apple'], ['google', 'google']])(
    'multiple active %s/%s subscriptions do not select a plan or grant permissions', async (first, second) => {
      for (const role of ['Worker', 'Owner', 'Administrator']) {
        for (const pending of [false, true]) {
          const records = [row({ billingProvider: first }), row({ id: 'second', billingProvider: second, startDate: new Date('2026-10-01') })];
          const before = JSON.stringify(records);
          for (const rows of [records, [...records].reverse()]) {
            const r = await run({ rows, role, pending });
            expect(r.web).toMatchObject({ isExpired: true, plan: null, subscription: null, permissions: [], accessIssue: 'multiple_subscriptions' });
            expect(r.mobile).toMatchObject({ isExpired: true, planInfo: null, subscription: null, permissions: [], accessIssue: 'multiple_subscriptions' });
            expect(r.candidate.reason).toBe('multiple_subscriptions');
          }
          expect(JSON.stringify(records)).toBe(before);
        }
      }
    },
  );
  it.each([
    { endDate: new Date('2026-10-01') },
    { planId: 'another-plan' },
    { startDate: new Date('2026-12-01') },
  ])('does not dismiss a second active record based on local dates or plan: %j', async patch => {
    const r = await run({ rows: [row(), row({ id: 'second', ...patch })] });
    expect(r.web.accessIssue).toBe('multiple_subscriptions');
    expect(r.mobile.accessIssue).toBe('multiple_subscriptions');
    expect(r.candidate.reason).toBe('multiple_subscriptions');
  });
  it('another company subscription does not create a conflict', async () => {
    const r = await run({ rows: [row(), row({ id: 'other-company-sub', companyId: 'other-company' })] });
    expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
    expect(r.web).not.toHaveProperty('accessIssue'); expect(r.mobile).not.toHaveProperty('accessIssue');
  });
  it('three active subscriptions remain a conflict with the bounded query', async () => {
    const r = await run({ rows: [row(), row({ id: 'second' }), row({ id: 'third' })] });
    expect(r.web.accessIssue).toBe('multiple_subscriptions');
    expect(r.mobile.accessIssue).toBe('multiple_subscriptions');
  });
  it.each(['stripe', 'apple', 'google'])('plan mismatch cannot grant company permissions for %s', async billingProvider => {
    for (const role of ['Worker', 'Owner', 'Administrator']) {
      for (const pending of [false, true]) {
        const record = row({ billingProvider, planId: 'different-plan' });
        const r = await run({ role, pending, rows: [record] });
        expect(r.web).toMatchObject({ isExpired: true, plan: null, permissions: [], accessIssue: 'company_subscription_plan_mismatch', subscription: record });
        expect(r.mobile).toMatchObject({ isExpired: true, planInfo: null, permissions: [], accessIssue: 'company_subscription_plan_mismatch', subscription: record });
        expect(r.candidate.reason).toBe('company_subscription_plan_mismatch');
      }
    }
  });
  it('missing company plan with an active subscription is a conflict, not permission to select another plan', async () => {
    const r = await run({ plan: false });
    expect(r.web).toMatchObject({ isExpired: true, permissions: [], plan: null, accessIssue: 'company_subscription_plan_mismatch' });
    expect(r.mobile).toMatchObject({ isExpired: true, permissions: [], planInfo: null, accessIssue: 'company_subscription_plan_mismatch' });
  });
  it('inactive history on a different plan does not block the consistent active subscription', async () => {
    const r = await run({ rows: [row(), row({ id: 'history', planId: 'old-plan', isActive: false, startDate: now })] });
    expect(r.web.isExpired).toBe(false); expect(r.mobile.isExpired).toBe(false);
    expect(r.web).not.toHaveProperty('accessIssue'); expect(r.mobile).not.toHaveProperty('accessIssue');
  });
  it('conflict preserves financial flags and subscription dates instead of rewriting billing state', async () => {
    const record = row({ planId: 'different-plan', paymentFailed: true, stripeSubscriptionCanceled: true });
    const before = JSON.stringify(record);
    const r = await run({ rows: [record] });
    for (const result of [r.web, r.mobile]) {
      expect(result).toMatchObject({ paymentFailed: true, stripeSubscriptionCanceled: true, subscription: record, permissions: [] });
    }
    expect(JSON.stringify(record)).toBe(before);
  });
  it.each([
    ['apple', 'MONTHLY'], ['google', 'MONTHLY'], ['stripe', 'FREE'],
  ])('D7: exclusive end boundary for %s/%s', async (billingProvider, type) => {
    for (const offset of [1, 0, -1]) {
      const r = await run({ type, rows: [row({ billingProvider, endDate: new Date(now.getTime() + offset) })] });
      expect(r.web.isExpired).toBe(offset <= 0);
      expect(r.mobile.isExpired).toBe(offset <= 0);
      expect(r.candidate.decision).toBe(offset > 0 ? 'allow' : 'deny');
    }
  });
  it.each(['apple', 'google'])('store %s non-renewal does not become a Stripe cancellation blocker', async billingProvider => {
    const record = row({ billingProvider, autoRenewing: false, stripeSubscriptionCanceled: true, appleBillingStatus: billingProvider === 'apple' ? 'canceled' : null });
    const result = await run({ rows: [record] });
    for (const status of [result.web, result.mobile]) {
      expect(status).toMatchObject({ isExpired: false, stripeSubscriptionCanceled: false, paymentFailed: false });
      expect(status.subscription).toEqual(record);
    }
    expect(record.stripeSubscriptionCanceled).toBe(true);
  });
  it.each([['MONTHLY', 3], ['MONTHLY', 4], ['ANNUAL', 1], ['CUSTOM', 4]] as const)(
    'web contract %s/%s is returned unchanged on mobile', async (type, duration) => {
      const result = await run({ type, duration });
      expect(result.web.plan).toEqual(result.mobile.planInfo);
      expect(result.mobile.planInfo).toMatchObject({ validityType: type, validityDuration: duration });
    });
  it.each(['apple', 'google'])('revoked %s record cannot grant permissions with a stale active flag', async billingProvider => {
    const result = await run({ rows: [row({ billingProvider, confirmedState: 'revoked' })] });
    expect(result.web).toMatchObject({ isExpired: true, permissions: [] });
    expect(result.mobile).toMatchObject({ isExpired: true, permissions: [] });
  });
  it.each(['paid', 'trial', 'canceled'])('known Apple %s state retains its valid period', async appleBillingStatus => {
    const result = await run({ rows: [row({ billingProvider: 'apple', appleBillingStatus })] });
    expect(result.web.isExpired).toBe(false);
    expect(result.mobile.isExpired).toBe(false);
  });
  it.each(['expired', 'refunded'])('terminal Apple %s state overrides stale active flag', async appleBillingStatus => {
    const result = await run({ rows: [row({ billingProvider: 'apple', appleBillingStatus })] });
    expect(result.web).toMatchObject({ isExpired: true, permissions: [] });
    expect(result.mobile).toMatchObject({ isExpired: true, permissions: [] });
  });

  it.each(['apple', 'google'])('verified %s grace grants access only within its confirmed end', async billingProvider => {
    for (const offset of [1, 0, -1]) {
      const record = row({ billingProvider, confirmedState: 'grace', paymentFailed: true, endDate: new Date(now.getTime() + offset) });
      const result = await run({ rows: [record] });
      for (const status of [result.web, result.mobile]) {
        expect(status.isExpired).toBe(offset <= 0);
        expect(status.paymentFailed).toBe(offset <= 0);
        expect(status.subscription.paymentFailed).toBe(true);
      }
    }
  });
  it.each(['apple', 'google'])('unconfirmed %s financial failure does not invent grace', async billingProvider => {
    const result = await run({ rows: [row({ billingProvider, paymentFailed: true })] });
    expect(result.web).toMatchObject({ isExpired: true, permissions: [], accessIssue: 'provider_or_legacy_state_required' });
    expect(result.mobile).toMatchObject({ isExpired: true, permissions: [], accessIssue: 'provider_or_legacy_state_required' });
  });

  it('expired identified FREE history does not mask the matching paid contract or mutate either row', async () => {
    const paid = row({ endDate: new Date('2026-10-01') });
    const history = row({ id: 'trial', planId: 'free-plan', plan: { validityType: 'FREE' }, endDate: new Date('2026-10-01') });
    const before = JSON.stringify([paid, history]);
    const result = await run({ rows: [history, paid] });
    expect(result.web).toMatchObject({ isExpired: false, subscription: paid });
    expect(result.mobile).toMatchObject({ isExpired: false, subscription: paid });
    expect(result.candidate.decision).toBe('allow');
    expect(JSON.stringify([paid, history])).toBe(before);
  });
  const trial = (patch: object = {}) => row({ id: 'trial', planId: 'free-plan', plan: { validityType: 'FREE' }, startDate: new Date('2026-11-01'), ...patch });
  const paid = (patch: object = {}) => row({ id: 'paid', plan: { validityType: 'MONTHLY' }, startDate: new Date('2026-10-01'), ...patch });

  it.each(['stripe', 'apple', 'google'])('a valid FREE grant does not conflict with the applied %s contract', async billingProvider => {
    const contract = paid({ billingProvider });
    const rows = [trial(), contract];
    const before = JSON.stringify(rows);
    const result = await run({ rows });
    expect(result.web).toMatchObject({ isExpired: false, subscription: { id: 'paid' }, plan: { id: 'plan' }, permissions: ['invoices'] });
    expect(result.web.accessIssue).toBeUndefined();
    expect(result.mobile).toMatchObject({ isExpired: false, subscription: { id: 'paid' }, permissions: ['invoices'] });
    expect(result.candidate).toMatchObject({ decision: 'allow', subscriptionId: 'paid' });
    expect(JSON.stringify(rows)).toBe(before);
  });
  it('a newer FREE grant cannot hide a second paid contract from the bounded query', async () => {
    const result = await run({ rows: [trial(), paid(), paid({ id: 'paid-2', billingProvider: 'apple', startDate: new Date('2026-09-01') })] });
    expect(result.web.accessIssue).toBe('multiple_subscriptions');
    expect(result.mobile.accessIssue).toBe('multiple_subscriptions');
  });
  it('a FREE grant remains a conflict with paid rows not applied to the company', async () => {
    for (const rows of [[trial(), paid({ planId: 'other' })], [trial(), row({ id: 'unknown-type' })]]) {
      const result = await run({ rows });
      expect(result.web.accessIssue).toBe('multiple_subscriptions');
      expect(result.mobile.accessIssue).toBe('multiple_subscriptions');
    }
  });
  it('the FREE grant cannot override a financial problem on the paid contract', async () => {
    const result = await run({ rows: [trial(), paid({ paymentFailed: true })] });
    expect(result.web).toMatchObject({ paymentFailed: true, subscription: { id: 'paid' } });
    expect(result.mobile).toMatchObject({ paymentFailed: true, subscription: { id: 'paid' } });
    expect(result.candidate.decision).toBe('review');
  });

});
