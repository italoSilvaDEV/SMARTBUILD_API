export const actions = ['session_start', 'session_update', 'session_end', 'section_view', 'section_exit', 'cta_click', 'scroll', 'faq', 'demo', 'calculator', 'toggle', 'video', 'rage_click', 'navigation'] as const;
export type LandingEvent = {
  id: string; sessionId: string; action: string; environment: string; device: string;
  section: string | null; sectionIndex: number | null; target: string | null;
  value: number | null; durationMs: number | null; newVisitor: boolean;
  utmCampaign: string | null; utmSource: string | null; occurredAt: Date;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function label(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(value)) throw Error('Invalid label');
  return value;
}
export function parseLandingEvent(input: any): LandingEvent {
  const occurredAt = new Date(input?.occurredAt);
  if (!uuid.test(input?.id) || !uuid.test(input?.sessionId) || !actions.includes(input?.action) ||
    !['production', 'development'].includes(input?.environment) || !['desktop', 'tablet', 'mobile'].includes(input?.device) ||
    !Number.isFinite(occurredAt.getTime()) || Math.abs(Date.now() - occurredAt.getTime()) > 86400000) throw Error('Invalid event');
  const number = (v: unknown, max: number) => {
    if (v == null) return null;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) throw Error('Invalid value');
    return Math.round(v);
  };
  return { id: input.id, sessionId: input.sessionId, action: input.action, environment: input.environment,
    device: input.device, section: label(input.section), sectionIndex: number(input.sectionIndex, 100), target: label(input.target),
    value: number(input.value, 100), durationMs: number(input.durationMs, 86400000), newVisitor: input.newVisitor === true,
    utmCampaign: label(input.utmCampaign), utmSource: label(input.utmSource), occurredAt };
}
export function summarizeLanding(events: LandingEvent[]) {
  const sessions = new Map<string, LandingEvent[]>();
  for (const e of events) sessions.set(e.sessionId, [...(sessions.get(e.sessionId) || []), e]);
  const unique = (rows: LandingEvent[]) => new Set(rows.map(e => e.sessionId)).size;
  const pct = (a: number, b: number) => b ? Math.round(a / b * 1000) / 10 : 0;
  const median = (values: number[]) => { values.sort((a,b) => a-b); const n = values.length; return n ? (values[Math.floor((n-1)/2)] + values[Math.floor(n/2)]) / 2 : 0; };
  const stats = (rows: LandingEvent[]) => {
    const ids = [...new Set(rows.map(e => e.sessionId))];
    const ctaSessions = unique(rows.filter(e => e.action === 'cta_click'));
    const active = ids.map(id => Math.max(0, ...rows.filter(e => e.sessionId === id && ['session_end', 'session_update'].includes(e.action)).map(e => e.durationMs || 0)));
    return { sessions: ids.length, ctaSessions, ctaRate: pct(ctaSessions, ids.length), medianActiveMs: median(active),
      medianScroll: median(ids.map(id => Math.max(0, ...rows.filter(e => e.sessionId === id && e.action === 'scroll').map(e => e.value || 0)))) };
  };
  const normalizedTarget = (e: LandingEvent) => e.target === 'control-47' && e.section === 'schedule-demo'
    ? 'schedule-demo-save-and-send' : /^control-\d+$/.test(e.target || '') ? 'legacy-interaction' : e.target;
  const groups = (action: string) => {
    const map = new Map<string, LandingEvent[]>();
    for (const e of events.filter(e => e.action === action)) { const key = JSON.stringify([normalizedTarget(e), e.section]); map.set(key, [...(map.get(key) || []), e]); }
    return [...map.values()].map(rows => ({ id: normalizedTarget(rows[0]), section: rows[0].section, events: rows.length,
      clicks: rows.length, sessions: unique(rows), avgValue: rows.some(e => e.value !== null) ? rows.reduce((s,e) => s + (e.value || 0),0)/rows.length : null }));
  };
  const buttonGroups = new Map<string, LandingEvent[]>();
  for (const e of events.filter(e => ['cta_click', 'demo', 'faq', 'toggle', 'video'].includes(e.action))) {
    const key = JSON.stringify([normalizedTarget(e), e.section]);
    buttonGroups.set(key, [...(buttonGroups.get(key) || []), e]);
  }
  const buttons = [...buttonGroups.values()].map(rows => ({ id: normalizedTarget(rows[0]), section: rows[0].section,
    clicks: rows.length, sessions: unique(rows) })).sort((a,b) => b.clicks-a.clicks || b.sessions-a.sessions);
  const segment = (key: 'utmCampaign' | 'utmSource' | 'device') => [...new Set(events.map(e => e[key] || 'direct'))]
    .map(id => ({ id, ...stats(events.filter(e => (e[key] || 'direct') === id)) }));
  const sectionIds = [...new Set(events.filter(e => e.section).map(e => e.section!))];
  const sections = sectionIds.map(id => {
    const rows = events.filter(e => e.section === id), views = rows.filter(e => e.action === 'section_view');
    const index = Math.min(...rows.map(e => e.sectionIndex ?? 100));
    const stoppedHere = [...sessions.values()].filter(es => {
      const seen = es.filter(e => e.action === 'section_view');
      const furthest = seen.reduce<LandingEvent | null>((last, event) =>
        !last || (event.sectionIndex ?? -1) >= (last.sectionIndex ?? -1) ? event : last, null);
      return furthest?.section === id;
    }).length;
    const exits = rows.filter(e => e.action === 'section_exit');
    const timeBySession = new Map<string, number>();
    for (const e of exits) timeBySession.set(e.sessionId, (timeBySession.get(e.sessionId) || 0) + (e.durationMs || 0));
    return { id, index, reachedSessions: unique(views), reachPct: pct(unique(views), sessions.size), stoppedHere,
      stoppedHerePct: pct(stoppedHere, sessions.size), exitedHere: unique(rows.filter(e => e.action === 'session_end')),
      avgDwellMs: timeBySession.size ? Math.round([...timeBySession.values()].reduce((sum,ms) => sum+ms,0)/timeBySession.size) : 0,
      ctaSessions: unique(rows.filter(e => e.action === 'cta_click')) };
  }).sort((a,b) => a.index-b.index);
  return { ...stats(events), newVisitorSessions: unique(events.filter(e => e.newVisitor)),
    engagedSessions: [...sessions.values()].filter(es => es.some(e => e.action === 'cta_click' || (['session_end', 'session_update'].includes(e.action) && (e.durationMs || 0) >= 10000))).length,
    sections, buttons, ctas: groups('cta_click'), scroll: [25,50,75,100].map(depth => { const n = unique(events.filter(e => e.action === 'scroll' && (e.value || 0) >= depth)); return {depth, sessions:n, pct:pct(n,sessions.size)}; }),
    faq: groups('faq'), demo: groups('demo'), calculator: groups('calculator'), toggles: groups('toggle'), video: groups('video'), rageClicks: groups('rage_click'), navigation: groups('navigation'),
    byCampaign: segment('utmCampaign'), bySource: segment('utmSource'), byDevice: segment('device'),
    daily: [...new Set(events.map(e => e.occurredAt.toISOString().slice(0,10)))].sort().map(day => ({ day, ...stats(events.filter(e => e.occurredAt.toISOString().startsWith(day))) })) };
}
