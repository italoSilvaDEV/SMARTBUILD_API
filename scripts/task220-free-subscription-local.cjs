// Run only against a disposable local MySQL with the repository schema already pushed.
// node -r ts-node/register/transpile-only scripts/task220-free-subscription-local.cjs
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const mysql = require('mysql2/promise');
const url = new URL(process.env.TASK220_TEST_DATABASE_URL || 'invalid:');
assert.equal(url.protocol, 'mysql:');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/task220');
const db = new PrismaClient({ datasources: { db: { url: url.href } } });
// Inject only this isolated client; do not import the application's environment/connection bootstrap.
const prismaPath = require.resolve('../src/utils/prisma');
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: db } };
const { SubscriptionController } = require('../src/controllers/subscriptions/SubscriptionController');
const controller = new SubscriptionController();
const invoke = async (companyId, userId, planId) => {
  let status, body;
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  await controller.create({ userId, body: { companyId, planId } }, res);
  return { status, body };
};
async function fixture(planId) {
  const company = await db.company.create({ data: { name: 'Disposable TASK220 fixture' } });
  const office = await db.office.create({ data: { name: 'Owner', company_id: company.id } });
  const user = await db.user.create({ data: { name: 'Test owner', email: `${company.id}@example.invalid`, password: 'not-a-real-login', rules: {}, company_id: company.id, office_id: office.id } });
  return { companyId: company.id, userId: user.id, planId };
}
(async () => {
  assert.equal(await db.company.count(), 0, 'Refusing a non-empty test database');
  assert.equal(await db.user.count(), 0, 'Refusing a non-empty test database');
  assert.equal(await db.plan.count(), 0, 'Refusing a non-empty test database');
  const group = await db.permissionGroup.create({ data: { description: 'Disposable test' } });
  const permission = await db.permissions.create({ data: { description: 'test-permission' } });
  await db.groupPermissionsList.create({ data: { permission_group: group.id, permission_id: permission.id } });
  const plan = await db.plan.create({ data: { name: 'Disposable FREE', description: 'Test only', validityType: 'FREE', validityDuration: 7, allowedEmployees: 2, permissionGroupId: group.id } });
  const concurrent = await fixture(plan.id);
  const ownerOffice = await db.office.findFirstOrThrow({ where: { company_id: concurrent.companyId, name: 'Owner' } });
  const otherActors = await Promise.all(Array.from({ length: 5 }, (_, i) => db.user.create({ data: {
    name: 'Concurrent test owner', email: `${i}-${concurrent.companyId}@example.invalid`, password: 'not-a-real-login',
    rules: {}, company_id: concurrent.companyId, office_id: ownerOffice.id,
  } })));
  const results = await Promise.all([concurrent.userId, ...otherActors.map(actor => actor.id)].map(userId => invoke(concurrent.companyId, userId, plan.id)));
  assert.equal(results.filter(r => r.status === 201).length, 1, JSON.stringify(results));
  assert.equal(results.filter(r => r.status === 409).length, 5, JSON.stringify(results));
  assert.equal(await db.subscription.count({ where: { companyId: concurrent.companyId } }), 1);
  assert.equal(await db.office.count({ where: { company_id: concurrent.companyId } }), 3);
  const subscribed = await db.company.findUniqueOrThrow({ where: { id: concurrent.companyId } });
  assert.equal(subscribed.planId, plan.id);
  assert.equal((await invoke(concurrent.companyId, concurrent.userId, plan.id)).status, 409);
  console.log('PASS: 6 concurrent real MySQL transactions => 1 creation, 5 conflicts; retry creates nothing');

  const rollback = await fixture(plan.id);
  // Database-level failure on the final office creation, after subscription/company/owner writes.
  const triggerConnection = await mysql.createConnection(url.href);
  await triggerConnection.query("CREATE TRIGGER task220_fail_admin BEFORE INSERT ON Office FOR EACH ROW BEGIN IF NEW.name = 'Administrator' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'TASK220 intentional rollback test'; END IF; END");
  const oldLog = console.error;
  let failed;
  try { console.error = () => {}; failed = await invoke(rollback.companyId, rollback.userId, plan.id); }
  finally {
    console.error = oldLog;
    try { await triggerConnection.query('DROP TRIGGER task220_fail_admin'); }
    finally { await triggerConnection.end(); }
  }
  assert.equal(failed.status, 500);
  assert.equal(await db.subscription.count({ where: { companyId: rollback.companyId } }), 0);
  assert.equal(await db.office.count({ where: { company_id: rollback.companyId } }), 1);
  assert.equal(await db.userPermission.count({ where: { office: { company_id: rollback.companyId } } }), 0);
  const untouchedCompany = await db.company.findUniqueOrThrow({ where: { id: rollback.companyId } });
  assert.equal(untouchedCompany.planId, null);
  assert.equal(untouchedCompany.allowedEmployees, null);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: rollback.userId } })).invoiceEditAll, false);
  console.log('PASS: database failure rolled back subscription, company plan/seats, offices, permissions and owner flags');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
