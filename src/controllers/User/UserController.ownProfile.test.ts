import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import * as vm from 'vm';
import { prisma } from '../../utils/prisma';
import { canUseCompanyFeature } from '../../services/CompanyFeatureAccess';
import { requireOwnUserRecord, requireUserManagementAccess, routeOwnProfileUpdate } from '../../middlewares/userManagementAccess';
const request = require('supertest');

jest.mock('../../utils/prisma', () => ({ prisma: { user: { findUnique: jest.fn(), update: jest.fn() }, office: { findUnique: jest.fn() } } }));
jest.mock('../../services/CompanyFeatureAccess', () => ({ canUseCompanyFeature: jest.fn() }));

const db = prisma as any;

// Runs the real profile handler without importing the controller's mail and provider clients.
function realSaveProfile() {
  const file = path.resolve(__dirname, 'UserController.ts');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  let code = '';
  const visit = (node: ts.Node) => {
    if (ts.isMethodDeclaration(node) && node.name.getText(source) === 'updateUserProfile') code = node.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  const js = ts.transpileModule(code.replace(/^async\s+/, 'async function '), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js + '\nupdateUserProfile', { prisma: db, console });
}

const fullUpdate = jest.fn((_req: any, res: any) => res.json({ message: 'full update' }));
const app = express();
app.use(express.json(), (req, _res, next) => { if (req.headers.authorization) (req as any).userId = String(req.headers.authorization); next(); });
const saveProfile = realSaveProfile();
app.put('/user', routeOwnProfileUpdate(saveProfile), requireUserManagementAccess, fullUpdate);
app.put('/user/update-profile', requireOwnUserRecord, saveProfile);

const put = (body: object, actor = 'me') => request(app).put('/user').set('Authorization', actor).send(body);
const sessionUser = { id: 'me', name: 'New Name', email: 'me@test', phone: '555', office: { id: 'owner-office', name: 'Owner' },
  isDisabled: false, hourly_price: 999, invoiceEditAll: true, company: { id: 'company' } };

beforeEach(() => {
  jest.clearAllMocks();
  db.user.update.mockResolvedValue({});
  db.user.findUnique.mockImplementation(async ({ where }: any) => {
    if (where.email === 'taken@test') return { id: 'someone' };
    if (where.email) return null;
    return { id: where.id, email: 'me@test', office_id: 'office', company_id: 'company', companies: [] };
  });
  (canUseCompanyFeature as jest.Mock).mockResolvedValue(false);
});

describe('saving the own profile', () => {
  it('does not depend on management permission, plan or subscription', async () => {
    const res = await put(sessionUser);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'User updated successfully' });
    expect(canUseCompanyFeature).not.toHaveBeenCalled();
    expect(fullUpdate).not.toHaveBeenCalled();
  });
  it('applies only contact fields from the full session user', async () => {
    await put(sessionUser);
    const { data } = db.user.update.mock.calls[0][0];
    expect(Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))).toEqual({ name: 'New Name', email: 'me@test', phone: '555' });
  });
  it.each([['name', 'Name is required'], ['email', 'Email is required']])('rejects a blank %s', async (field, error) => {
    const res = await put({ ...sessionUser, [field]: '  ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('rejects an email owned by another account', async () => {
    const res = await put({ ...sessionUser, email: 'taken@test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Email already registered');
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('accepts a new free email', async () => {
    expect((await put({ ...sessionUser, email: 'free@test' })).status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data.email).toBe('free@test');
  });
});

describe('management path is unchanged', () => {
  it('another user without company_id still needs the guard', async () => {
    expect((await put({ ...sessionUser, id: 'other' })).status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(fullUpdate).not.toHaveBeenCalled();
  });
  it('own record with company_id without permission stays denied', async () => {
    expect((await put({ ...sessionUser, company_id: 'company' })).status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('empty company_id does not count as a profile save', async () => {
    expect((await put({ ...sessionUser, company_id: '' })).status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('manager editing another user reaches the full update', async () => {
    (canUseCompanyFeature as jest.Mock).mockResolvedValue(true);
    db.office.findUnique.mockResolvedValue({ name: 'Worker', company_id: 'company', legacyPlanPermissions: false });
    expect((await put({ ...sessionUser, id: 'other', company_id: 'company' })).status).toBe(200);
    expect(fullUpdate).toHaveBeenCalledTimes(1);
  });
  it('requires a session', async () => {
    expect((await request(app).put('/user').send(sessionUser)).status).toBe(401);
    expect(db.user.update).not.toHaveBeenCalled();
  });
  it('the real route composes the profile step before the guard', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../../routes/userRoutes.ts'), 'utf8');
    expect(routes).toContain('userRoutes.put("/user", checkToken, routeOwnProfileUpdate(User.updateUserProfile), requireUserManagementAccess, User.update)');
  });
});

describe('Crew profile route keeps its contract', () => {
  const crew = (body: object) => request(app).put('/user/update-profile').set('Authorization', 'me').send(body);
  it('still saves address fields', async () => {
    expect((await crew({ id: 'me', name: 'Crew', email: 'me@test', zip_code: '123', neighborhood: 'Center' })).status).toBe(200);
    expect(db.user.update.mock.calls[0][0].data).toMatchObject({ name: 'Crew', zip_code: '123', neighborhood: 'Center' });
  });
  it('accepts a partial body without name or email', async () => {
    expect((await crew({ id: 'me', phone: '555' })).status).toBe(200);
  });
  it('cannot save another user', async () => {
    expect((await crew({ id: 'other', name: 'X', email: 'x@test' })).status).toBe(403);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});
