jest.mock('../utils/prisma', () => ({
  prisma: { accountDeletionRequest: { upsert: jest.fn() } },
}));
import express from 'express';
import { accountDeletionRoutes } from './accountDeletionRoutes';
import { prisma } from '../utils/prisma';
const request = require('supertest');
const app = express();
app.use('/account-deletion', accountDeletionRoutes);
const save = prisma.accountDeletionRequest.upsert as jest.Mock;
async function form() {
  const response = await request(app).get('/account-deletion?lang=pt');
  return response.text.match(/name="token" value="([^"]+)"/)[1];
}
beforeEach(() => {
  process.env.ACCOUNT_DELETION_FORM_SECRET = 'test-only-form-secret';
  process.env.ACCOUNT_DELETION_RETENTION_EN = 'Test retention policy.';
  process.env.ACCOUNT_DELETION_RETENTION_PT = 'Política de teste.';
  save.mockReset().mockResolvedValue({});
});
test('public localized form works without login, escapes policy and sets protective headers', async () => {
  process.env.ACCOUNT_DELETION_RETENTION_PT = '<script>alert(1)</script>';
  const response = await request(app).get('/account-deletion?lang=pt');
  expect(response.status).toBe(200);
  expect(response.text).toContain('Solicitar exclusão da conta');
  expect(response.text).toContain('&lt;script&gt;');
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.headers['content-security-policy']).toContain("form-action 'self'");
});
test('persists only an unverified request and gives an idempotent reference', async () => {
  const token = await form();
  for (let i = 0; i < 2; i++) {
    const response = await request(app).post('/account-deletion').type('form')
      .send({ token, email: ' DEMO@EXAMPLE.COM ', confirm: 'yes', locale: 'pt' });
    expect(response.status).toBe(200);
    expect(response.text).toContain('Solicitação registrada');
    expect(response.text).not.toContain('DEMO@EXAMPLE.COM');
  }
  expect(save).toHaveBeenCalledWith({
    where: { id: token.split('.')[0] },
    create: { id: token.split('.')[0], email: 'demo@example.com', locale: 'pt' },
    update: {},
  });
});
test.each([
  { email: 'invalid', confirm: 'yes' },
  { email: 'demo@example.com' },
  { email: 'demo@example.com', confirm: 'yes', website: 'spam' },
])('rejects invalid form without writing data: %j', async fields => {
  const response = await request(app).post('/account-deletion').type('form')
    .send({ token: await form(), ...fields });
  expect(response.status).toBe(400);
  expect(save).not.toHaveBeenCalled();
});
test('rejects a tampered token', async () => {
  const response = await request(app).post('/account-deletion').type('form')
    .send({ token: 'forged', email: 'demo@example.com', confirm: 'yes' });
  expect(response.status).toBe(400);
  expect(save).not.toHaveBeenCalled();
});
test('never claims success if persistence fails', async () => {
  save.mockRejectedValue(new Error('database unavailable'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(app).post('/account-deletion').type('form')
    .send({ token: await form(), email: 'demo@example.com', confirm: 'yes', locale: 'pt' });
  expect(response.status).toBe(503);
  expect(response.text).toContain('Não foi possível salvar');
  expect(response.text).not.toContain('Solicitação registrada');
  log.mockRestore();
});
test('does not publish a page without actual retention policy', async () => {
  delete process.env.ACCOUNT_DELETION_RETENTION_EN;
  expect((await request(app).get('/account-deletion')).status).toBe(503);
});
test('rejects expired form tokens without saving', async () => {
  const token = await form();
  const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3600001);
  try {
    const response = await request(app).post('/account-deletion').type('form')
      .send({ token, email: 'demo@example.com', confirm: 'yes' });
    expect(response.status).toBe(400);
    expect(save).not.toHaveBeenCalled();
  } finally { now.mockRestore(); }
});
test('limits large form bodies', async () => {
  const response = await request(app).post('/account-deletion').type('form')
    .send({ email: 'x'.repeat(5000) });
  expect(response.status).toBe(413);
  expect(save).not.toHaveBeenCalled();
});
test('throttles repeated attempts', async () => {
  let response;
  for (let i = 0; i < 32; i++) {
    response = await request(app).post('/account-deletion').type('form').send({ token: 'invalid' });
  }
  expect(response.status).toBe(429);
  expect(response.headers['retry-after']).toBe('3600');
  expect(save).not.toHaveBeenCalled();
});
