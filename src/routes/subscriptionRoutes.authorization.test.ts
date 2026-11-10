import express from 'express';
const request = require('supertest');

jest.mock('../utils/prisma', () => ({ prisma: { user: { findUnique: jest.fn() }, subscription: { findUnique: jest.fn() } } }));
jest.mock('../middlewares/checkToken', () => ({
  checkToken: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.userId = 'session-user';
    next();
  },
}));
jest.mock('../middlewares/publicAccess', () => ({
  checkTokenOrRegistrationToken: (_req: any, _res: any, next: any) => next(),
}));
jest.mock('../controllers/subscriptions/SubscriptionController', () => {
  const handler = jest.fn((_req: any, res: any) => res.sendStatus(204));
  return { SubscriptionController: jest.fn().mockImplementation(() => ({
    create: handler, getAllSubscriptions: handler, getSubscriptionById: handler,
    getSubscriptionsByCompany: handler, updateSubscription: handler,
    cancelSubscription: handler, renewSubscription: handler,
  })) };
});

import { prisma } from '../utils/prisma';
import { SubscriptionController } from '../controllers/subscriptions/SubscriptionController';
import { subscriptionRoutes } from './subscriptionRoutes';
const app = express();
app.use(express.json(), subscriptionRoutes);
const handler = (SubscriptionController as jest.Mock).mock.results[0].value.updateSubscription;
const master = {
  id: 'session-user', name: 'Master', email: 'test@example.com', isDisabled: false,
  company_id: null, office: { name: 'Master', company_id: null }, companies: [],
};
const routes = [
  ['get', '/subscriptions'], ['put', '/subscriptions/sub'],
  ['patch', '/subscriptions/sub/cancel'], ['patch', '/subscriptions/sub/renew'],
];
beforeEach(() => { jest.clearAllMocks(); (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({ companyId: 'company' }); });

describe.each(routes)('%s %s administrative authorization', (method, path) => {
  test('requires authentication before reaching the controller', async () => {
    expect((await request(app)[method](path)).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  test.each([
    ['owner', { ...master, office: { name: 'Owner', company_id: 'company' } }],
    ['administrator', { ...master, office: { name: 'Administrator', company_id: 'company' } }],
    ['tenant office named Master', { ...master, office: { name: 'Master', company_id: 'company' } }],
    ['linked company', { ...master, companies: [{ companyId: 'company' }] }],
    ['primary company', { ...master, company_id: 'company' }],
    ['disabled Master', { ...master, isDisabled: true }],
    ['missing user', null],
  ])('rejects %s without invoking any subscription operation', async (_label, user) => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    const result = await request(app)[method](path).set('Authorization', 'session')
      .send({ userId: 'master', role: 'Master', isActive: true, endDate: '2099-01-01' });
    expect(result.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-user' } }));
  });
  test('preserves access for the existing platform Master identity', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(master);
    expect((await request(app)[method](path).set('Authorization', 'session')).status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test('fails closed if authorization cannot be checked', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('database unavailable'));
      expect((await request(app)[method](path).set('Authorization', 'session')).status).toBe(500);
      expect(handler).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

describe.each(['/subscriptions/sub', '/companies/company/subscriptions'])('company isolation: %s', path => {
  test.each([
    ['legacy company', { ...master, company_id: 'company', office: { name: 'Owner', company_id: 'company' } }],
    ['secondary company', { ...master, company_id: 'other', companies: [{ companyId: 'company' }], office: { name: 'Worker', company_id: 'other' } }],
    ['platform Master', master],
  ])('preserves %s access', async (_label, user) => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    expect((await request(app).get(path).set('Authorization', 'session')).status).toBe(204);
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test.each([
    ['unrelated company', { ...master, company_id: 'other', office: { name: 'Owner', company_id: 'other' } }],
    ['tenant Master', { ...master, office: { name: 'Master', company_id: 'other' } }],
    ['disabled account', { ...master, isDisabled: true }],
    ['missing account', null],
  ])('rejects %s before returning subscription data', async (_label, user) => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
    expect((await request(app).get(path).set('Authorization', 'session').send({ companyId: 'company', userId: 'master' })).status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
  test('rejects unauthenticated access', async () => {
    expect((await request(app).get(path)).status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
  test('fails closed on database failure', async () => {
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('unavailable'));
      expect((await request(app).get(path).set('Authorization', 'session')).status).toBe(503);
      expect(handler).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});

test('does not reveal missing subscription records to ordinary sessions', async () => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ ...master, company_id: 'company' });
  (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
  expect((await request(app).get('/subscriptions/missing').set('Authorization', 'session')).status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});
