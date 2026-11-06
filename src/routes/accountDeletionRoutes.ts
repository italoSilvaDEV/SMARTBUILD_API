import express, { Router } from 'express';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { prisma } from '../utils/prisma';
import { deletionPage } from '../views/accountDeletionPage';

const secret = () => process.env.ACCOUNT_DELETION_FORM_SECRET || process.env.SECRET_JWT;
const sign = (value: string) => createHmac('sha256', secret()!).update(value).digest('hex');
const issueToken = () => {
  const payload = randomUUID() + '.' + Date.now();
  return payload + '.' + sign(payload);
};
function tokenId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 160) return null;
  const [id, time, signature, extra] = value.split('.');
  if (extra || !/^[a-f0-9-]{36}$/.test(id) || !/^\d{13}$/.test(time) || !/^[a-f0-9]{64}$/.test(signature || '')) return null;
  const age = Date.now() - Number(time);
  if (age < 0 || age > 60 * 60 * 1000) return null;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(sign(id + '.' + time), 'hex')) ? id : null;
}

export const accountDeletionRoutes = Router();
// Mounted before the application's large JSON parser; this endpoint accepts only small forms.
accountDeletionRoutes.use(express.urlencoded({ extended: false, limit: '4kb', parameterLimit: 8 }));
accountDeletionRoutes.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (!secret() || !process.env.ACCOUNT_DELETION_RETENTION_EN || !process.env.ACCOUNT_DELETION_RETENTION_PT) {
    res.status(503).type('text').send('Account deletion requests: contact support@smartbuild4u.com. Solicitações de exclusão: contate support@smartbuild4u.com.');
    return;
  }
  next();
});

// Bounded, per-process throttle. Do not trust arbitrary X-Forwarded-For headers.
const attempts = new Map<string, { count: number; until: number }>();
accountDeletionRoutes.get('/', (req, res) => {
  const locale = req.query.lang === 'pt' ? 'pt' : 'en';
  res.type('html').send(deletionPage(locale, issueToken()));
});
accountDeletionRoutes.post('/', async (req, res) => {
  const locale = req.body?.locale === 'pt' ? 'pt' : 'en';
  const failure = (status: number, message: string) =>
    res.status(status).type('html').send(deletionPage(locale, issueToken(), message));
  const now = Date.now();
  for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const entry = attempts.get(key) || { count: 0, until: now + 60 * 60 * 1000 };
  if (entry.count >= 30 || (attempts.size >= 10000 && !attempts.has(key))) {
    res.set('Retry-After', '3600');
    failure(429, locale === 'pt' ? 'Muitas tentativas. Tente novamente mais tarde ou contate o suporte.' : 'Too many attempts. Try again later or contact support.');
    return;
  }
  entry.count++;
  attempts.set(key, entry);
  const id = tokenId(req.body?.token);
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!id || req.body?.confirm !== 'yes' || email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(email) || req.body?.website) {
    failure(400, locale === 'pt' ? 'Confira o e-mail e a confirmação. Se a página expirou, envie novamente.' : 'Check your email and confirmation. If the page expired, submit again.');
    return;
  }
  try {
    // Form token is an idempotency key. Do not query users or reveal whether an email exists.
    await prisma.accountDeletionRequest.upsert({
      where: { id },
      create: { id, email, locale },
      update: {},
    });
    res.status(200).type('html').send(deletionPage(locale, '', undefined, id));
  } catch {
    // Never log the submitted email or token.
    console.error('[account-deletion] Could not persist request');
    failure(503, locale === 'pt' ? 'Não foi possível salvar o pedido. Tente novamente ou contate support@smartbuild4u.com.' : 'We could not save your request. Please retry or contact support@smartbuild4u.com.');
  }
});
