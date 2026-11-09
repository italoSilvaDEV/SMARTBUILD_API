import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';
import { prisma } from '../utils/prisma';
import { canUseCompanyFeature } from '../services/CompanyFeatureAccess';
const request = require('supertest');

// Real routes and guards with the payloads of installed clients. Controllers are isolated, so no mail leaves.
const reached = jest.fn((req: any, res: any) => res.json({ authorizedInvoiceId: req.authorizedInvoiceId }));
jest.mock('../controllers/invoice/CustomInvoiceController', () => ({ CustomInvoiceController: class { constructor() { return new Proxy(this, { get: () => (req: any, res: any) => reached(req, res) }); } } }));
jest.mock('../controllers/invoice/MobileStandaloneCustomInvoiceController', () => ({ MobileStandaloneCustomInvoiceController: class { constructor() { return new Proxy(this, { get: () => (req: any, res: any) => reached(req, res) }); } } }));
jest.mock('../middlewares/checkToken', () => ({ checkToken: (req: any, res: any, next: any) => { if (!req.headers.authorization) return res.sendStatus(401); req.userId = String(req.headers.authorization); next(); } }));
jest.mock('../utils/prisma', () => ({ prisma: { invoice: { findFirst: jest.fn(), findUnique: jest.fn() }, pdfProject: { findUnique: jest.fn() }, pdfInvoicePaid: { findUnique: jest.fn() }, project: { findUnique: jest.fn() } } }));
jest.mock('../services/CompanyFeatureAccess', () => ({ canUseCompanyFeature: jest.fn() }));
import { customInvoiceRoutes } from './customInvoiceRoutes';

const db = prisma as any;
const app = express();
app.use(express.json(), customInvoiceRoutes);
const invoices = [
  { id: 'invoice-a', externalInvoiceId: '1001', companyId: 'company-a', invoiceType: 'custom', project: { company_id: 'company-a' } },
  { id: 'invoice-b', externalInvoiceId: '1001', companyId: 'company-b', invoiceType: 'custom', project: { company_id: 'company-b' } },
  { id: 'invoice-a2', externalInvoiceId: '1002', companyId: 'company-a', invoiceType: 'custom', project: { company_id: 'company-a' } },
  { id: 'invoice-qb', externalInvoiceId: '2001', companyId: 'company-a', invoiceType: 'quickbooks', project: { company_id: 'company-a' } },
];
const receipts: Record<string, any> = { 'receipt-a': { id: 'receipt-a', invoiceId: 'invoice-a' }, 'receipt-a2': { id: 'receipt-a2', invoiceId: 'invoice-a2' }, 'receipt-b': { id: 'receipt-b', invoiceId: 'invoice-b' } };
const canAccess = new Set(['owner-a|company-a', 'owner-b|company-b']);

beforeEach(() => {
  reached.mockClear();
  db.invoice.findFirst.mockReset().mockImplementation(async ({ where }: any) => invoices.find(row => row.externalInvoiceId === where.externalInvoiceId && row.companyId === where.companyId && (!where.invoiceType || where.invoiceType.in.includes(row.invoiceType))) ?? null);
  db.invoice.findUnique.mockReset().mockImplementation(async ({ where }: any) => invoices.find(row => row.id === where.id) ?? null);
  db.pdfProject.findUnique.mockReset().mockResolvedValue({ project_id: 'project-a' });
  db.project.findUnique.mockReset().mockResolvedValue({ company_id: 'company-a' });
  db.pdfInvoicePaid.findUnique.mockReset().mockImplementation(async ({ where }: any) => receipts[where.id] ?? null);
  (canUseCompanyFeature as jest.Mock).mockReset().mockImplementation(async (user: string, company: string) => canAccess.has(`${user}|${company}`));
});

const adminSend = { companyId: 'company-a', customBody: 'b', customEmails: ['c@example.invalid'], customSubject: 's', idPdfProject: 'pdf-a', userId: 'owner-a' };
const webMultiple = { userId: 'owner-a', emails: ['c@example.invalid'], companyId: 'company-a' };
const send = (number: string, body: object, user = 'owner-a') => request(app).post(`/custom/invoice/${number}/send`).set('Authorization', user).send(body);
const multiple = (number: string, body: object, user = 'owner-a') => request(app).post(`/custom/invoice/${number}/send-multiple`).set('Authorization', user).send(body);

describe.each([['send', send, adminSend], ['send-multiple', multiple, webMultiple]] as const)('POST /custom/invoice/:number/%s', (_name, call, payload) => {
  it('accepts the externalInvoiceId and companyId sent by installed clients and binds that invoice', async () => {
    const res = await call('1001', payload);
    expect(res.status).toBe(200);
    expect(res.body.authorizedInvoiceId).toBe('invoice-a');
  });
  it('resolves an equal number only inside the authorized company', async () => {
    const res = await call('1001', { ...payload, companyId: 'company-b', userId: 'owner-b', idPdfProject: undefined }, 'owner-b');
    expect(res.status).toBe(200);
    expect(res.body.authorizedInvoiceId).toBe('invoice-b');
  });
  it('denies a user without access to the requested company', async () => {
    expect((await call('1001', { ...payload, companyId: 'company-b', idPdfProject: undefined })).status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
    expect(db.invoice.findFirst).not.toHaveBeenCalled();
  });
  it('does not search globally when companyId is missing', async () => {
    const { companyId, ...withoutCompany } = payload as any;
    expect((await call('1001', withoutCompany)).status).toBe(400);
    expect(reached).not.toHaveBeenCalled();
    expect(db.invoice.findFirst).not.toHaveBeenCalled();
  });
  it('returns not found for a number absent from the company', async () => {
    expect((await call('9999', payload)).status).toBe(404);
    expect(reached).not.toHaveBeenCalled();
  });
  it('requires a session', async () => {
    expect((await request(app).post('/custom/invoice/1001/send').send(payload)).status).toBe(401);
  });
});
it('keeps the invoice types accepted by each delivery', async () => {
  expect((await send('2001', adminSend)).status).toBe(200);
  expect((await multiple('2001', webMultiple)).status).toBe(404);
});
it('binds the PDF route by number using the query company', async () => {
  const res = await request(app).get('/custom/invoice/1001/pdf').query({ companyId: 'company-a' }).set('Authorization', 'owner-a');
  expect(res.status).toBe(200);
  expect(res.body.authorizedInvoiceId).toBe('invoice-a');
});
it('a foreign PDF cannot be attached to the send', async () => {
  db.project.findUnique.mockResolvedValue({ company_id: 'company-b' });
  expect((await send('1001', adminSend)).status).toBe(403);
  expect(reached).not.toHaveBeenCalled();
});

describe('POST /invoice/send/paid', () => {
  const paid = (patch: object = {}, user = 'owner-a') => request(app).post('/invoice/send/paid').set('Authorization', user).send({ companyId: 'company-a', customBody: 'b', customEmails: ['c@example.invalid'], customSubject: 's', invoiceId: 'invoice-a', pdfInvoicePaidId: 'receipt-a', userId: 'owner-a', ...patch });
  it('accepts a receipt of the requested invoice', async () => {
    expect((await paid()).status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });
  it('denies a missing receipt', async () => {
    expect((await paid({ pdfInvoicePaidId: 'missing' })).status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });
  it('denies a receipt of another invoice in the same company', async () => {
    expect((await paid({ pdfInvoicePaidId: 'receipt-a2' })).status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });
  it('denies a receipt of another company', async () => {
    expect((await paid({ pdfInvoicePaidId: 'receipt-b' })).status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });
  it('denies a user without access to the invoice company', async () => {
    expect((await paid({}, 'owner-b')).status).toBe(403);
    expect(reached).not.toHaveBeenCalled();
  });
  it('never consults the generic PDF table for the receipt', async () => {
    await paid();
    expect(db.pdfProject.findUnique).not.toHaveBeenCalled();
  });
});

describe('the controller uses the invoice authorized by the middleware', () => {
  const file = path.resolve(__dirname, '../controllers/invoice/CustomInvoiceController.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const method = (name: string, context: object) => {
    let code = '';
    const visit = (node: ts.Node) => { if (ts.isMethodDeclaration(node) && node.name.getText(source) === name) code = node.getText(source); ts.forEachChild(node, visit); };
    visit(source);
    const js = ts.transpileModule(code.replace(/^async\s+/, 'async function '), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    return vm.runInNewContext(js + '\n' + name, { console: { log() {}, error() {} }, ...context });
  };
  const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() }) as any;
  it.each([['sendInvoice', { userId: 'u', companyId: 'company-a', idPdfProject: 'pdf' }], ['sendInvoiceMultiple', { userId: 'u', companyId: 'company-a', emails: ['c@example.invalid'] }]])('%s reads by the bound id', async (name, body) => {
    const findFirst = jest.fn(async () => null);
    await method(name, { prisma: { invoice: { findFirst } } })({ params: { invoiceId: '1001' }, body, authorizedInvoiceId: 'invoice-a' }, response());
    expect((findFirst.mock.calls[0] as any)[0].where).toMatchObject({ id: 'invoice-a', companyId: 'company-a' });
  });
  it('generateInvoicePdf reads by the bound id', async () => {
    const findFirst = jest.fn(async () => null);
    await method('generateInvoicePdf', { prisma: { invoice: { findFirst } } })({ params: { invoiceId: '1001' }, query: { companyId: 'company-a' }, authorizedInvoiceId: 'invoice-a' }, response());
    expect((findFirst.mock.calls[0] as any)[0].where).toMatchObject({ id: 'invoice-a', companyId: 'company-a' });
  });
});
