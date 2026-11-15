import express from 'express';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
const request = require('supertest');
jest.mock('../middlewares/checkToken', () => ({ checkToken: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.userId = 'user-a'; next();
} }));
jest.mock('../utils/prisma', () => ({ prisma: { user: { findFirst: jest.fn() } } }));
import { prisma } from '../utils/prisma';
import { attendanceDiagnosticsRoutes } from './attendanceDiagnosticsRoutes';
const app = express(); app.use(express.json(), attendanceDiagnosticsRoutes);
let directory: string;
const event = () => ({ id: 'event-1', userId: 'user-a', companyId: 'company-a', at: Date.now(),
  traceId: 'trace-1', stage: 'touch.press', details: { busy: false, token: 'secret', latitude: 11 },
  release: { appVersion: '2.39', build: '77', updateId: null, embedded: true, platform: 'android',
    runtimeVersion: '2.39', channel: 'homologation' } });
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'attendance-diagnostics-'));
  process.env.ATTENDANCE_DIAGNOSTICS_DIR = directory;
  (prisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'user-a' });
});
afterEach(async () => { delete process.env.ATTENDANCE_DIAGNOSTICS_DIR; await fs.rm(directory, { recursive: true }); });
test('requires authentication and prevents cross-user attribution', async () => {
  expect((await request(app).post('/mobile/attendance-diagnostics').send({})).status).toBe(401);
  expect((await request(app).post('/mobile/attendance-diagnostics').set('Authorization','test')
    .send({ companyId: 'company-a', events: [{ ...event(), userId: 'victim' }] })).status).toBe(400);
});
test('persists only allowed fields before acknowledging the batch', async () => {
  const r = await request(app).post('/mobile/attendance-diagnostics').set('Authorization','test')
    .send({ companyId: 'company-a', events: [event()] });
  expect(r.status).toBe(200); expect(r.body.acceptedIds).toEqual(['event-1']);
  const files = await fs.readdir(directory); const rows = await fs.readFile(path.join(directory, files[0]), 'utf8');
  expect(rows).not.toContain('secret'); expect(rows).not.toContain('latitude');
  expect(JSON.parse(rows)).toMatchObject({ userId: 'user-a', release: { embedded: true, build: '77' } });
});
test('rejects foreign companies, excessive batches and stale events', async () => {
  (prisma.user.findFirst as jest.Mock).mockResolvedValue(null);
  const send = (events: any[]) => request(app).post('/mobile/attendance-diagnostics').set('Authorization','test')
    .send({ companyId: 'company-a', events });
  expect((await send([event()])).status).toBe(403);
  expect((await send(Array(31).fill(event()))).status).toBe(400);
  expect((await send([{ ...event(), at: Date.now() - 8 * 86400_000 }])).status).toBe(400);
  expect(await fs.readdir(directory)).toEqual([]);
});
test('disabled receiver never acknowledges a discarded batch', async () => {
  delete process.env.ATTENDANCE_DIAGNOSTICS_DIR;
  expect((await request(app).post('/mobile/attendance-diagnostics').set('Authorization','test')
    .send({ companyId: 'company-a', events: [event()] })).status).toBe(503);
});
