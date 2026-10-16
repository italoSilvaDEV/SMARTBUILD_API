import express from 'express';
const request = require('supertest');
jest.mock('../middlewares/checkToken', () => ({
  checkToken: (req: any, res: any, next: any) => {
    if (!req.headers.authorization) return res.sendStatus(401);
    req.userId = 'trusted-user'; next();
  },
}));
jest.mock('../middlewares/requireMaster', () => ({
  requireMaster: (req: any, res: any, next: any) =>
    req.headers.authorization === 'master' ? next() : res.sendStatus(403),
}));
jest.mock('../utils/prisma', () => ({
  prisma: { user: { findFirst: jest.fn() }, appAnalyticsEvent: { createMany: jest.fn(), findMany: jest.fn() } },
}));
import { appAnalyticsRoutes } from './appAnalyticsRoutes';
import { prisma } from '../utils/prisma';
const app = express();
app.use(express.json(), appAnalyticsRoutes);
const event = { id: 'a0000000-0000-0000-0000-000000000001',
  sessionId: 'b0000000-0000-0000-0000-000000000001', module: 'estimates',
  screen: 'create', action: 'save_success', platform: 'ios', appVersion: '1.0.0',
  releaseId: 'embedded', environment: 'production', tutorial: false, occurredAt: new Date().toISOString() };
beforeEach(() => {
  process.env.APP_ANALYTICS_ENABLED = 'true'; jest.clearAllMocks();
  (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'trusted-user' });
  (prisma.appAnalyticsEvent.createMany as jest.Mock).mockResolvedValue({ count: 1 });
  (prisma.appAnalyticsEvent.findMany as jest.Mock).mockResolvedValue([]);
});
test('requires authenticated ingestion and master-only reporting', async () => {
  expect((await request(app).post('/mobile/analytics/events').send({})).status).toBe(401);
  expect((await request(app).get('/master/app-analytics').set('Authorization', 'member')).status).toBe(403);
});
test('derives identity from authentication and deduplicates event IDs', async () => {
  const response = await request(app).post('/mobile/analytics/events').set('Authorization', 'member')
    .send({ companyId: 'company', events: [{ ...event, userId: 'spoofed', description: 'private' }] });
  expect(response.status).toBe(204);
  const saved = (prisma.appAnalyticsEvent.createMany as jest.Mock).mock.calls[0][0];
  expect(saved.skipDuplicates).toBe(true);
  expect(saved.data[0].userId).toBe('trusted-user');
  expect(saved.data[0]).not.toHaveProperty('description');
});
test('rejects unrelated company and oversized event batches', async () => {
  (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
  expect((await request(app).post('/mobile/analytics/events').set('Authorization', 'member')
    .send({ companyId: 'other', events: [event] })).status).toBe(403);
  expect((await request(app).post('/mobile/analytics/events').set('Authorization', 'member')
    .send({ companyId: 'company', events: Array(31).fill(event) })).status).toBe(400);
  expect(prisma.appAnalyticsEvent.createMany).not.toHaveBeenCalled();
});
test('reports do not silently truncate data or allow unlimited date ranges', async () => {
  (prisma.appAnalyticsEvent.findMany as jest.Mock).mockResolvedValue(Array(20001).fill(event));
  expect((await request(app).get('/master/app-analytics').set('Authorization', 'master')).status).toBe(422);
  expect((await request(app).get('/master/app-analytics?from=2020-01-01&to=2026-10-09')
    .set('Authorization', 'master')).status).toBe(400);
});
test('disabled collection does not write to the database', async () => {
  process.env.APP_ANALYTICS_ENABLED = 'false';
  expect((await request(app).post('/mobile/analytics/events').set('Authorization', 'member').send({})).status).toBe(204);
  expect(prisma.appAnalyticsEvent.createMany).not.toHaveBeenCalled();
});
test('anonymous ingestion accepts auth events only and cannot impersonate a company', async () => {
  expect((await request(app).post('/mobile/analytics/auth-events').send({ events: [event] })).status).toBe(400);
  const response = await request(app).post('/mobile/analytics/auth-events').send({
    companyId: 'spoofed', events: [{ ...event, module: 'auth', screen: 'main', action: 'login_error' }],
  });
  expect(response.status).toBe(204);
  const saved = (prisma.appAnalyticsEvent.createMany as jest.Mock).mock.calls[0][0].data[0];
  expect(saved.companyId).toBe('anonymous');
  expect(saved.userId).toBe('anonymous:' + event.sessionId);
});
