// Run from the API repository. Reads only; no controllers/providers are imported.
require('dotenv').config();
const fs = require('fs');
const vm = require('vm');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const { evaluateSubscriptionAccess, compareSubscriptionAccess, hasSubscriptionPlanConflict, resolveCompanySubscriptionStatus } = require(process.cwd() + '/dist/services/SubscriptionAccessDecision');
const { resolveEffectivePermissions } = require(process.cwd() + '/dist/utils/planPermissions');
const db = new PrismaClient();
const readMethods = new Set(['findUnique', 'findFirst', 'findMany', 'count']);
const readOnly = new Proxy({}, { get(_, model) {
  if (String(model).startsWith('$')) throw new Error('Database operation forbidden');
  return new Proxy({}, { get(_, operation) {
    if (!readMethods.has(operation)) throw new Error('Database mutation forbidden');
    return db[model][operation].bind(db[model]);
  } });
} });
const now = new Date();
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  static now() { return now.getTime(); }
}
function extract(file, name, method, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const matches = [];
  function visit(node) {
    if ((method ? ts.isMethodDeclaration(node) : ts.isFunctionDeclaration(node)) && node.name?.getText(source) === name) matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (matches.length !== 1) throw new Error('Source function is not unique');
  let code = matches[0].getText(source);
  if (method) code = code.replace(/^async\s+/, 'async function ');
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js + '\n' + name, {
    prisma: readOnly, resolveCompanySubscriptionStatus, resolveEffectivePermissions, evaluateSubscriptionAccess, hasSubscriptionPlanConflict, Date: FixedDate,
    console: { error() {}, info() {}, warn() {} }, ...context,
  });
}
async function main() {
  let observed;
  const webStatus = extract('src/controllers/User/UserController.ts', 'getLocalSubscriptionsStatus', true, {
    observeSubscriptionAccess: async input => { observed = input; },
  });
  const mobileStatus = extract('src/controllers/mobile/MobileAuthController.ts', 'getCompanyStatus', false, {});
  // Scope to the account name observed in the user-authorized browser session.
  // Multiple matching accounts remain separate; no assumption about the selected company.
  const users = await readOnly.user.findMany({ where: { name: 'Rian Gonçalves' }, select: { id: true }, orderBy: { id: 'asc' } });
  const reports = [];
  for (let u = 0; u < users.length; u++) {
    const userId = users[u].id;
    const links = await readOnly.userCompany.findMany({ where: { userId }, select: { companyId: true }, orderBy: { companyId: 'asc' } });
    for (let c = 0; c < links.length; c++) {
      const companyId = links[c].companyId;
      let body, status = 200;
      observed = undefined;
      const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
      await webStatus({ params: { userId, company_id: companyId }, userId }, res);
      if (status !== 200 || !observed) throw new Error('Actual web handler failed');
      const mobile = await mobileStatus(companyId);
      const rows = await readOnly.subscription.findMany({ where: { companyId }, select: {
        id: true, companyId: true, planId: true, billingProvider: true, startDate: true, endDate: true,
        isActive: true, paymentFailed: true, stripeSubscriptionCanceled: true, autoRenewing: true, appleBillingStatus: true,
      } });
      const input = {
        companyId, plan: observed.company.Plan ? { ...observed.company.Plan, permissions: observed.planPermissions } : null,
        allowedEmployees: observed.company.allowedEmployees ?? 0, extraEmployees: observed.company.extraEmployees ?? 0,
        officePermissions: observed.officePermissions, officeName: observed.officeName, hasCompanyAccess: observed.hasCompanyAccess,
        pendingSubscription: observed.company.mobileSubscriptionStatus === 'pending_subscription', subscriptions: rows, now,
      };
      const candidate = evaluateSubscriptionAccess(input);
      const mobileExisting = {
        subscriptionId: mobile.subscription?.id ?? null, planId: mobile.planInfo?.id ?? null,
        isExpired: mobile.isExpired, paymentFailed: mobile.paymentFailed, stripeSubscriptionCanceled: mobile.stripeSubscriptionCanceled,
        permissions: resolveEffectivePermissions(mobile.permissions, observed.officePermissions, observed.officeName),
        seatLimit: input.allowedEmployees + input.extraEmployees,
      };
      const webMobileDifferences = [];
      for (const key of ['subscriptionId', 'planId', 'isExpired', 'paymentFailed', 'stripeSubscriptionCanceled', 'seatLimit']) {
        if (observed.existing[key] !== mobileExisting[key]) webMobileDifferences.push(key);
      }
      if (JSON.stringify([...observed.existing.permissions].sort()) !== JSON.stringify([...mobileExisting.permissions].sort())) webMobileDifferences.push('permissions');
      reports.push({ context: `account-${u+1}/company-${c+1}`, role: observed.officeName,
        plan: body.plan ? { name: body.plan.name, period: body.plan.validityType, duration: body.plan.validityDuration } : null,
        subscriptions: rows.map(row => ({ provider: row.billingProvider, active: row.isActive, start: row.startDate, end: row.endDate,
          samePlanAsCompany: row.planId === input.plan?.id, paymentFailed: row.paymentFailed, canceled: row.stripeSubscriptionCanceled })),
        oldWeb: { expired: body.isExpired, permissionCount: body.permissions.length, seatLimit: observed.existing.seatLimit },
        oldMobile: { expired: mobile.isExpired, permissionCount: mobileExisting.permissions.length, seatLimit: mobileExisting.seatLimit },
        candidate: { decision: candidate.decision, reason: candidate.reason, permissionCount: candidate.permissions.length, seatLimit: candidate.seatLimit },
        webVsCandidate: compareSubscriptionAccess(observed.existing, candidate),
        mobileVsCandidate: compareSubscriptionAccess(mobileExisting, candidate), webVsMobile: webMobileDifferences,
      });
    }
  }
  console.log(JSON.stringify({ timestamp: now, matchingAccounts: users.length, mode: 'read-only actual status functions; not HTTP or mobile login', reports }, null, 2));
}
main().catch(error => { console.error('Diagnostic failed:', error.name); process.exitCode = 1; }).finally(() => db.$disconnect());
