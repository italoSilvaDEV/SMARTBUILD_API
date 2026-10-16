import { Router, json } from 'express';
import { prisma } from '../utils/prisma';
import { checkToken } from '../middlewares/checkToken';
import { requireMaster } from '../middlewares/requireMaster';
import { parseLandingEvent, summarizeLanding } from '../services/LandingAnalyticsService';
export const landingAnalyticsRoutes = Router();
const limits = new Map<string, { at: number; count: number }>();
landingAnalyticsRoutes.post('/landing/analytics/events', json({ limit: '32kb' }), async (req, res) => {
  if (process.env.LANDING_ANALYTICS_ENABLED !== 'true') return res.sendStatus(204);
  const now = Date.now();
  for (const [key,v] of limits) if (now-v.at > 60000) limits.delete(key);
  const key = req.ip || 'unknown', limit = limits.get(key) || { at: now, count: 0 };
  if (limit.count >= 60 || limits.size > 10000) return res.sendStatus(429);
  limit.count++; limits.set(key, limit);
  if (!Array.isArray(req.body?.events) || !req.body.events.length || req.body.events.length > 30) return res.sendStatus(400);
  let data;
  try { data = req.body.events.map(parseLandingEvent); } catch { return res.sendStatus(400); }
  try { await prisma.landingAnalyticsEvent.createMany({ data, skipDuplicates: true }); return res.sendStatus(204); }
  catch { return res.status(503).json({ error: 'Landing analytics temporarily unavailable' }); }
});
landingAnalyticsRoutes.get('/master/landing-analytics', checkToken, requireMaster, async (req, res) => {
  const from = new Date(String(req.query.from || new Date(Date.now()-7*86400000).toISOString()));
  const to = new Date(String(req.query.to || new Date().toISOString()));
  if (!Number.isFinite(+from) || !Number.isFinite(+to) || to <= from || +to-+from > 31*86400000) return res.status(400).json({ error: 'Choose a period of at most 31 days' });
  const environment = req.query.environment || 'production';
  if (!['production','development'].includes(String(environment))) return res.sendStatus(400);
  const filters: Record<string,string> = {};
  for (const name of ['device','utmCampaign','utmSource']) {
    if (req.query[name] !== undefined) {
      const v = req.query[name];
      if (typeof v !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(v) || (name === 'device' && !['desktop','tablet','mobile'].includes(v))) return res.sendStatus(400);
      filters[name] = v;
    }
  }
  try {
    const events = await prisma.landingAnalyticsEvent.findMany({ where: { occurredAt: {gte:from,lt:to}, environment:String(environment), ...filters }, orderBy: [{occurredAt:'asc'},{id:'asc'}], take:20001 });
    if (events.length > 20000) return res.status(422).json({error:'Too many events. Narrow the period or filters.'});
    return res.json({...summarizeLanding(events), collectionEnabled: process.env.LANDING_ANALYTICS_ENABLED === 'true'});
  } catch { return res.status(503).json({error:'Landing analytics temporarily unavailable'}); }
});
