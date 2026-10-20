export const actions = ['session_start', 'session_update', 'session_end', 'section_view', 'section_exit', 'cta_click', 'scroll', 'faq', 'demo', 'calculator', 'toggle', 'video', 'rage_click', 'navigation'] as const;
export const DEFAULT_LANDING = 'pro-smartbuild';
export type LandingEvent = {
  id: string; sessionId: string; action: string; environment: string; device: string;
  landingSlug: string; landingName: string | null; pageUrl: string | null;
  sectionLabel: string | null; targetLabel: string | null;
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
// Nomes legíveis definidos no HTML da landing (data-track-label), nunca texto digitado pelo visitante.
function text(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw Error('Invalid text');
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!/^[\p{L}\p{N} .,:;!?()&/+'"%$#-]{1,120}$/u.test(clean)) throw Error('Invalid text');
  return clean;
}
function slug(value: unknown): string {
  if (value == null || value === '') return DEFAULT_LANDING;
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw Error('Invalid landing');
  return value;
}
// Só origem + caminho da própria landing; query string e hash são descartados.
function pageUrl(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 255) throw Error('Invalid url');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw Error('Invalid url');
  return `${url.origin}${url.pathname}`.slice(0, 255);
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
    device: input.device, landingSlug: slug(input.landingSlug), landingName: text(input.landingName), pageUrl: pageUrl(input.pageUrl),
    sectionLabel: text(input.sectionLabel), targetLabel: text(input.targetLabel), section: label(input.section), sectionIndex: number(input.sectionIndex, 100), target: label(input.target),
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
  // Nome legível mais recente enviado pela landing para a seção ou o botão
  const latest = (rows: LandingEvent[], key: 'sectionLabel' | 'targetLabel') => {
    for (let i = rows.length - 1; i >= 0; i--) if (rows[i][key]) return rows[i][key];
    return null;
  };
  const normalizedTarget = (e: LandingEvent) => e.target === 'control-47' && e.section === 'schedule-demo'
    ? 'schedule-demo-save-and-send' : /^control-\d+$/.test(e.target || '') ? 'legacy-interaction' : e.target;
  const groups = (action: string) => {
    const map = new Map<string, LandingEvent[]>();
    for (const e of events.filter(e => e.action === action)) { const key = JSON.stringify([normalizedTarget(e), e.section]); map.set(key, [...(map.get(key) || []), e]); }
    return [...map.values()].map(rows => ({ id: normalizedTarget(rows[0]), section: rows[0].section,
      label: latest(rows, 'targetLabel'), sectionLabel: latest(rows, 'sectionLabel'), events: rows.length,
      clicks: rows.length, sessions: unique(rows), avgValue: rows.some(e => e.value !== null) ? rows.reduce((s,e) => s + (e.value || 0),0)/rows.length : null }));
  };
  const buttonGroups = new Map<string, LandingEvent[]>();
  for (const e of events.filter(e => ['cta_click', 'demo', 'faq', 'toggle', 'video'].includes(e.action))) {
    const key = JSON.stringify([normalizedTarget(e), e.section]);
    buttonGroups.set(key, [...(buttonGroups.get(key) || []), e]);
  }
  const buttons = [...buttonGroups.values()].map(rows => ({ id: normalizedTarget(rows[0]), section: rows[0].section,
    label: latest(rows, 'targetLabel'), sectionLabel: latest(rows, 'sectionLabel'), clicks: rows.length, sessions: unique(rows) })).sort((a,b) => b.clicks-a.clicks || b.sessions-a.sessions);
  const segment = (key: 'utmCampaign' | 'utmSource' | 'device') => [...new Set(events.map(e => e[key] || 'direct'))]
    .map(id => ({ id, ...stats(events.filter(e => (e[key] || 'direct') === id)) }));
  // Só partes da página que foram vistas; cliques no topo/rodapé não viram seção da jornada
  const sectionIds = [...new Set(events.filter(e => e.section && e.action === 'section_view').map(e => e.section!))];
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
    return { id, index, label: latest(rows, 'sectionLabel'), reachedSessions: unique(views), reachPct: pct(unique(views), sessions.size), stoppedHere,
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

// Comparativo entre landings do mesmo período: uma linha por slug, com os mesmos indicadores principais.
export function compareLandings(events: LandingEvent[]) {
  const bySlug = new Map<string, LandingEvent[]>();
  for (const e of events) bySlug.set(e.landingSlug, [...(bySlug.get(e.landingSlug) || []), e]);
  return [...bySlug.entries()].map(([slug, rows]) => {
    const summary = summarizeLanding(rows);
    const named = [...rows].reverse();
    return { id: slug, name: named.find(e => e.landingName)?.landingName || null, url: named.find(e => e.pageUrl)?.pageUrl || null,
      sessions: summary.sessions, ctaSessions: summary.ctaSessions, ctaRate: summary.ctaRate, engagedSessions: summary.engagedSessions,
      engagedRate: summary.sessions ? Math.round(summary.engagedSessions / summary.sessions * 1000) / 10 : 0,
      medianActiveMs: summary.medianActiveMs, medianScroll: summary.medianScroll };
  }).sort((a, b) => b.sessions - a.sessions);
}
