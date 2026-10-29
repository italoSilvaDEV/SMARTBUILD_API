import express from 'express';
const request = require('supertest');
jest.mock('../middlewares/checkToken', () => ({ checkToken: (req: any, res: any, next: any) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  req.userId = 'actor'; next();
} }));
jest.mock('../utils/financialAccess', () => ({ userCanViewFinancials: jest.fn() }));
jest.mock('../services/ReceiptExtractionService', () => {
  const original = jest.requireActual('../services/ReceiptExtractionService');
  return { ...original, extractReceipt: jest.fn() };
});
jest.mock('../utils/prisma', () => ({ prisma: {
  project: { findUnique: jest.fn() },
  projectBudget: { findUnique: jest.fn(), create: jest.fn(), updateMany: jest.fn(), findUniqueOrThrow: jest.fn() },
  $transaction: jest.fn(),
} }));
import { prisma } from '../utils/prisma';
import { userCanViewFinancials } from '../utils/financialAccess';
import { extractReceipt } from '../services/ReceiptExtractionService';
import { projectBudgetRoutes } from './projectBudgetRoutes';
const app = express(); app.use(express.json(), projectBudgetRoutes);
const path = '/mobile/projects/project/budget';
const scan = '/mobile/projects/project/receipt-extraction';
beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  (prisma.project.findUnique as jest.Mock).mockResolvedValue({ company_id: 'company' });
  (userCanViewFinancials as jest.Mock).mockResolvedValue(true);
  (prisma.projectBudget.findUnique as jest.Mock).mockResolvedValue(null);
  (prisma.$transaction as jest.Mock).mockImplementation(callback => callback(prisma));
});
test('all endpoints require authentication', async () => {
  expect((await request(app).get(path)).status).toBe(401);
  expect((await request(app).put(path).send({})).status).toBe(401);
  expect((await request(app).post(scan)).status).toBe(401);
});
test('financial access is checked against project company before any read or AI call', async () => {
  (userCanViewFinancials as jest.Mock).mockResolvedValue(false);
  expect((await request(app).get(path).set('Authorization', 'user')).status).toBe(403);
  expect((await request(app).post(scan).set('Authorization', 'user')).status).toBe(403);
  expect(userCanViewFinancials).toHaveBeenCalledWith('actor', 'company');
  expect(prisma.projectBudget.findUnique).not.toHaveBeenCalled();
  expect(extractReceipt).not.toHaveBeenCalled();
});
test('an unset budget is not a zero budget and scan availability is explicit', async () => {
  const res = await request(app).get(path).set('Authorization', 'user');
  expect(res.body).toEqual({ budget: null, receiptScanAvailable: false });
});
test('new budget uses authenticated author and never modifies operational costs', async () => {
  (prisma.projectBudget.create as jest.Mock).mockResolvedValue({ revision: 1 });
  const res = await request(app).put(path).set('Authorization', 'user')
    .send({ revision: 0, materials: '250.50', employees: null, subcontractors: '0', updatedBy: 'spoofed' });
  expect(res.status).toBe(200);
  expect(prisma.projectBudget.create).toHaveBeenCalledWith({ data: {
    projectId: 'project', materials: '250.50', employees: null, subcontractors: '0', updatedBy: 'actor',
  } });
});
test('stale revisions and concurrent initial creates return a conflict', async () => {
  const body = { revision: 1, materials: '1', employees: null, subcontractors: null };
  (prisma.projectBudget.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
  expect((await request(app).put(path).set('Authorization', 'user').send(body)).status).toBe(409);
  (prisma.projectBudget.create as jest.Mock).mockRejectedValue({ code: 'P2002' });
  expect((await request(app).put(path).set('Authorization', 'user').send({ ...body, revision: 0 })).status).toBe(409);
});
test('missing provider key is a safe unavailable response', async () => {
  expect((await request(app).post(scan).set('Authorization', 'user')).status).toBe(503);
  expect(extractReceipt).not.toHaveBeenCalled();
});
test('extraction returns a draft only, without creating a budget or cost', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-only';
  (extractReceipt as jest.Mock).mockResolvedValue({ total: '100.00', currency: 'USD' });
  const res = await request(app).post(scan).set('Authorization', 'user').attach('file', Buffer.from('image'), 'receipt.jpg');
  expect(res.status).toBe(200);
  expect(res.body.receipt.total).toBe('100.00');
  expect(prisma.$transaction).not.toHaveBeenCalled();
});
afterAll(() => { delete process.env.ANTHROPIC_API_KEY; });

test('multiple pages reach extraction in one request, without writing costs', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-only';
  (extractReceipt as jest.Mock).mockResolvedValue({ total: null, currency: 'USD' });
  const res = await request(app).post(scan).set('Authorization', 'user')
    .attach('file', Buffer.from('page-one'), 'first.jpg')
    .attach('file', Buffer.from('page-two'), 'second.jpg');
  expect(res.status).toBe(200);
  expect(res.body.receipt.total).toBeNull();
  expect(extractReceipt).toHaveBeenCalledWith([Buffer.from('page-one'), Buffer.from('page-two')]);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

test('upload refuses more than five pages before extraction', async () => {
  process.env.ANTHROPIC_API_KEY = 'test-only';
  let pending = request(app).post(scan).set('Authorization', 'user');
  for (let index = 0; index < 6; index++) pending = pending.attach('file', Buffer.from('image'), `page-${index}.jpg`);
  expect((await pending).status).toBe(400);
  expect(extractReceipt).not.toHaveBeenCalled();
});
