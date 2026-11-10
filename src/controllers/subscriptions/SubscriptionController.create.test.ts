import express from 'express';
const request = require('supertest');
jest.mock('../../utils/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('../../middlewares/checkToken', () => ({ checkToken: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.userId = 'owner'; next();
} }));
import { prisma } from '../../utils/prisma';
import { subscriptionRoutes } from '../../routes/subscriptionRoutes';
import { issueRegistrationToken } from '../../utils/publicAccessTokens';

const app = express(); app.use(express.json(), subscriptionRoutes);
const owner = { isDisabled: false, company_id: 'company', office: { name: 'Owner', company_id: 'company' }, companies: [] };
const plan = { id: 'free', validityType: 'FREE', validityDuration: 7, allowedEmployees: 2, isInviteOnly: false,
  permissionGroup: { GroupPermissionsList: [{ permission_id: 'invoices' }] } };
const db = {
  user: { findUnique: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  userCompany: { findMany: jest.fn() },
  plan: { findUnique: jest.fn() }, company: { findUnique: jest.fn(), update: jest.fn() },
  subscription: { findFirst: jest.fn(), create: jest.fn() },
  office: { findFirst: jest.fn(), create: jest.fn() },
  userPermission: { deleteMany: jest.fn(), createMany: jest.fn() },
  planInvite: { findFirst: jest.fn() }, campaign: { findUnique: jest.fn() },
};
const previousSecret = process.env.PUBLIC_ACCESS_JWT_SECRET;
beforeAll(() => { process.env.PUBLIC_ACCESS_JWT_SECRET = 'local-free-subscription-test-secret'; });
afterAll(() => { if (previousSecret === undefined) delete process.env.PUBLIC_ACCESS_JWT_SECRET; else process.env.PUBLIC_ACCESS_JWT_SECRET = previousSecret; });
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as jest.Mock).mockImplementation(async callback => callback(db));
  db.user.findUnique.mockResolvedValue(owner);
  db.user.findMany.mockResolvedValue([{ id: 'owner' }]); db.userCompany.findMany.mockResolvedValue([]);
  db.plan.findUnique.mockResolvedValue(plan); db.company.findUnique.mockResolvedValue({ id: 'company', allowedEmployees: 4 });
  db.subscription.findFirst.mockResolvedValue(null);
  db.subscription.create.mockImplementation(async ({ data }) => ({ id: 'subscription', ...data }));
  db.office.findFirst.mockImplementation(async ({ where }) => where.name === 'Owner' ? { id: 'owner-office', userPermissions: [] } : null);
  db.office.create.mockImplementation(async ({ data }) => ({ id: data.name, ...data }));
});
const create = (body: any = {}) => request(app).post('/subscriptions').set('Authorization', 'session').send({ companyId: 'company', planId: 'free', ...body });
const expectNoWrites = () => {
  for (const fn of [db.subscription.create, db.company.update, db.office.create, db.userPermission.deleteMany, db.userPermission.createMany, db.user.updateMany]) expect(fn).not.toHaveBeenCalled();
};

test('preserves initial FREE subscription, duration, seat allowance and owner setup inside one serializable transaction', async () => {
  const result = await create();
  expect(result.status).toBe(201);
  expect(result.body).toMatchObject({ id: 'subscription', companyId: 'company', planId: 'free', isActive: true, campaignId: null });
  expect(new Date(result.body.endDate).getDate()).toBe(new Date(new Date(result.body.startDate).setDate(new Date(result.body.startDate).getDate() + 7)).getDate());
  expect(db.company.update).toHaveBeenCalledWith({ where: { id: 'company' }, data: { planId: 'free', allowedEmployees: 4 } });
  expect(db.user.updateMany).toHaveBeenCalled();
  expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
});
test.each([
  ['Worker', { ...owner, office: { name: 'Worker', company_id: 'company' } }],
  ['other company owner', { ...owner, company_id: 'other', office: { name: 'Owner', company_id: 'other' } }],
  ['tenant Master', { ...owner, office: { name: 'Master', company_id: 'company' } }],
  ['disabled', { ...owner, isDisabled: true }], ['missing', null],
  ['worker in secondary company despite primary ownership', { ...owner, companies: [{ companyId: 'company', office: { name: 'Worker' } }] }],
])('rejects %s without writes', async (_label, actor) => {
  db.user.findUnique.mockResolvedValue(actor);
  expect((await create({ userId: 'master', role: 'Master' })).status).toBe(403); expectNoWrites();
});
test.each([
  ['secondary company administrator', { ...owner, company_id: 'other', companies: [{ companyId: 'company', office: { name: 'Administrator' } }] }],
  ['platform Master', { ...owner, company_id: null, office: { name: 'Master', company_id: null }, companies: [] }],
])('allows %s', async (_label, actor) => { db.user.findUnique.mockResolvedValue(actor); expect((await create()).status).toBe(201); });
test('accepts a valid signup token without a session', async () => {
  const result = await request(app).post('/subscriptions').send({ companyId: 'company', planId: 'free', registrationToken: issueRegistrationToken('company', 'owner') });
  expect(result.status).toBe(201);
  expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'owner' } }));
});
test('rejects signup token used for another company before any transaction', async () => {
  expect((await request(app).post('/subscriptions').send({ companyId: 'other', planId: 'free', registrationToken: issueRegistrationToken('company', 'owner') })).status).toBe(403);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
test('requires authentication', async () => { expect((await request(app).post('/subscriptions').send({ companyId: 'company', planId: 'free' })).status).toBe(401); expectNoWrites(); });
test.each(['stripe', 'apple', 'google', 'free'])('does not overwrite an active %s subscription or reset its dates', async provider => {
  db.subscription.findFirst.mockResolvedValue({ id: 'existing', billingProvider: provider });
  expect((await create()).status).toBe(409); expectNoWrites();
});
test('repeated request cannot create a second subscription', async () => {
  expect((await create()).status).toBe(201);
  db.subscription.findFirst.mockResolvedValue({ id: 'subscription' });
  expect((await create()).status).toBe(409);
  expect(db.subscription.create).toHaveBeenCalledTimes(1);
});
test('paid plans still cannot be activated through this endpoint', async () => {
  db.plan.findUnique.mockResolvedValue({ ...plan, validityType: 'MONTHLY' });
  expect((await create()).status).toBe(400); expectNoWrites();
});
test('preserves invitation requirement', async () => {
  db.plan.findUnique.mockResolvedValue({ ...plan, isInviteOnly: true });
  expect((await create()).status).toBe(403); expectNoWrites();
  db.planInvite.findFirst.mockResolvedValue({ id: 'redeemed' });
  expect((await create()).status).toBe(201);
});
test.each([null, { isActive: false }, { isActive: true, endDate: new Date(0) }, { isActive: true, endDate: new Date('2099-01-01'), planId: 'other' }])('rejects invalid campaign before writes', async campaign => {
  db.campaign.findUnique.mockResolvedValue(campaign);
  expect((await create({ campaignId: 'campaign' })).status).toBe(400); expectNoWrites();
});
test('preserves valid campaign association', async () => {
  db.campaign.findUnique.mockResolvedValue({ isActive: true, endDate: new Date('2099-01-01'), planId: 'free' });
  expect((await create({ campaignId: 'campaign' })).body).toMatchObject({ campaignId: 'campaign', fromCampaign: true });
});
test.each(['company', 'office', 'permissions', 'owner'])('propagates %s write failure out of the transaction, never returning success', async step => {
  const failure = new Error('write failed');
  const fn = { company: db.company.update, office: db.office.create, permissions: db.userPermission.createMany, owner: db.user.updateMany }[step]!;
  fn.mockRejectedValue(failure);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    expect((await create()).status).toBe(500);
    await expect((prisma.$transaction as jest.Mock).mock.results[0].value).rejects.toBe(failure);
  } finally { log.mockRestore(); }
});
test('returns conflict on serialization failure without replaying writes outside the transaction', async () => {
  (prisma.$transaction as jest.Mock).mockRejectedValue({ code: 'P2034' });
  expect((await create()).status).toBe(409); expectNoWrites();
});

test('keeps existing default roles and custom permissions when creating a later trial', async () => {
  db.office.findFirst.mockImplementation(async ({ where }) => ({ id: where.name, userPermissions: [{ permission_id: 'custom', editAll: true }] }));
  expect((await create()).status).toBe(201);
  expect(db.office.create).not.toHaveBeenCalled();
  expect(db.userPermission.deleteMany).not.toHaveBeenCalled();
  expect(db.userPermission.createMany).not.toHaveBeenCalled();
});
