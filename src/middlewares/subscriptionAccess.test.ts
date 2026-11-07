import express from 'express';
const request = require('supertest');
jest.mock('../utils/prisma', () => ({ prisma: { user: { findUnique: jest.fn() } } }));
import { prisma } from '../utils/prisma';
import { requireOwnSubscriptionStatus } from './subscriptionAccess';
const handler = jest.fn((_req: any, res: any) => res.sendStatus(204));
const app = express();
app.use((req, _res, next) => { (req as any).userId = req.headers['x-session-user']; next(); });
app.get('/status/:userId/:company_id', requireOwnSubscriptionStatus, handler);
beforeEach(() => jest.clearAllMocks());

test.each([
  ['legacy', { company_id: 'company', companies: [] }],
  ['multi-company', { company_id: 'other', companies: [{ companyId: 'company' }] }],
])('preserves own status for %s membership', async (_label, user) => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
  expect((await request(app).get('/status/self/company').set('x-session-user', 'self')).status).toBe(204);
  expect(handler).toHaveBeenCalledTimes(1);
});
test('rejects a different user ID even in the same company, without a database query', async () => {
  expect((await request(app).get('/status/other/company').set('x-session-user', 'self')).status).toBe(403);
  expect(prisma.user.findUnique).not.toHaveBeenCalled();
  expect(handler).not.toHaveBeenCalled();
});
test.each([null, { company_id: 'other', companies: [] }])('rejects missing membership', async user => {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue(user);
  expect((await request(app).get('/status/self/company').set('x-session-user', 'self')).status).toBe(403);
  expect(handler).not.toHaveBeenCalled();
});
test('requires a session', async () => {
  expect((await request(app).get('/status/self/company')).status).toBe(401);
  expect(handler).not.toHaveBeenCalled();
});
test('fails closed when membership cannot be checked', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    (prisma.user.findUnique as jest.Mock).mockRejectedValue(new Error('unavailable'));
    expect((await request(app).get('/status/self/company').set('x-session-user', 'self')).status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  } finally { log.mockRestore(); }
});
