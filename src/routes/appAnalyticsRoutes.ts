import { Router } from 'express';
import { checkToken } from '../middlewares/checkToken';
import { requireMaster } from '../middlewares/requireMaster';
import { prisma } from '../utils/prisma';
import { parseAnalyticsEvent, summarizeAnalytics } from '../services/AppAnalyticsService';

export const appAnalyticsRoutes = Router();
const limits = new Map<string, { at: number; count: number }>();
const anonymousLimits = new Map<string, { at: number; count: number }>();

// Anonymous login diagnostics have a separate, tightly constrained contract.
// No IP, credentials, email, device identifier or relationship to the account is persisted.
appAnalyticsRoutes.post('/mobile/analytics/auth-events', async (req, res) => {
  if (process.env.APP_ANALYTICS_ENABLED !== 'true') return res.sendStatus(204);
  const now = Date.now();
  for (const [key, item] of anonymousLimits) if (now - item.at > 60_000) anonymousLimits.delete(key);
  const key = req.ip || 'unknown';
  const limit = anonymousLimits.get(key) ?? { at: now, count: 0 };
  if (limit.count >= 10 || anonymousLimits.size > 5000) return res.sendStatus(429);
  limit.count++;
  anonymousLimits.set(key, limit);
  const events = req.body?.events;
  if (!Array.isArray(events) || !events.length || events.length > 10) return res.sendStatus(400);
  let parsed: ReturnType<typeof parseAnalyticsEvent>[];
  try {
    parsed = events.map(e => parseAnalyticsEvent(e, now));
    if (parsed.some(e => e.module !== 'auth' || e.screen !== 'main' || e.tutorial ||
      !['login_attempt', 'login_success', 'login_error', 'signup_attempt', 'signup_success', 'signup_error'].includes(e.action))) {
      return res.sendStatus(400);
    }
  } catch { return res.sendStatus(400); }
  try {
    await prisma.appAnalyticsEvent.createMany({ data: parsed.map(e => ({
      ...e, userId: 'anonymous:' + e.sessionId, companyId: 'anonymous',
    })), skipDuplicates: true });
    return res.sendStatus(204);
  } catch { return res.sendStatus(503); }
});

appAnalyticsRoutes.post('/mobile/analytics/events', checkToken, async (req, res) => {
  if (process.env.APP_ANALYTICS_ENABLED !== 'true') return res.sendStatus(204);
  const userId = (req as any).userId as string;
  const now = Date.now();
  for (const [key, entry] of limits) if (now - entry.at > 60_000) limits.delete(key);
  const limit = limits.get(userId) ?? { at: now, count: 0 };
  if (limit.count >= 20 || limits.size > 10_000) return res.sendStatus(429);
  limit.count++;
  limits.set(userId, limit);
  const { companyId, events } = req.body ?? {};
  if (typeof companyId !== 'string' || companyId.length > 191 ||
    !Array.isArray(events) || !events.length || events.length > 30) {
    return res.status(400).json({ error: 'Invalid batch' });
  }
  let parsed: ReturnType<typeof parseAnalyticsEvent>[];
  try { parsed = events.map(e => parseAnalyticsEvent(e, now)); }
  catch { return res.status(400).json({ error: 'Invalid event' }); }
  try {
    const member = await prisma.user.findFirst({
      where: { id: userId, OR: [{ company_id: companyId }, { companies: { some: { companyId } } }] },
      select: { id: true },
    });
    if (!member) return res.sendStatus(403);
    await prisma.appAnalyticsEvent.createMany({
      data: parsed.map(e => ({ ...e, userId, companyId })), skipDuplicates: true,
    });
    return res.sendStatus(204);
  } catch (error) {
    console.error('[AppAnalytics] ingest failed');
    return res.status(503).json({ error: 'Analytics temporarily unavailable' });
  }
});

appAnalyticsRoutes.get('/master/app-analytics', checkToken, requireMaster, async (req, res) => {
  const from = new Date(String(req.query.from ?? new Date(Date.now() - 7 * 86_400_000).toISOString()));
  const to = new Date(String(req.query.to ?? new Date().toISOString()));
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from ||
    to.getTime() - from.getTime() > 31 * 86_400_000) {
    return res.status(400).json({ error: 'Choose a period of at most 31 days' });
  }
  const platform = req.query.platform;
  if (platform && !['ios', 'android', 'web'].includes(String(platform))) return res.sendStatus(400);
  const appVersion = req.query.appVersion;
  if (appVersion && !/^[a-zA-Z0-9._-]{1,40}$/.test(String(appVersion))) return res.sendStatus(400);
  const companyId = req.query.companyId;
  if (companyId && (typeof companyId !== 'string' || companyId.length > 191)) return res.sendStatus(400);
  const environment = req.query.environment === 'development' ? 'development' : 'production';
  try {
    // Hard bound protects the operational database. Never present a partial sample as a full total.
    const events = await prisma.appAnalyticsEvent.findMany({
      where: { occurredAt: { gte: from, lt: to }, environment,
        ...(platform ? { platform: String(platform) } : {}),
        ...(appVersion ? { appVersion: String(appVersion) } : {}),
        ...(companyId ? { companyId: String(companyId) } : {}) },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }], take: 20_001,
    });
    if (events.length > 20_000) return res.status(422).json({
      error: 'Too many events. Narrow the period or filter by company, version or platform.',
    });
    return res.json({ ...summarizeAnalytics(events), from, to, environment,
      collectionEnabled: process.env.APP_ANALYTICS_ENABLED === 'true' });
  } catch {
    return res.status(503).json({ error: 'Analytics temporarily unavailable' });
  }
});
