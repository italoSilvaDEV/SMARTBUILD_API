import { analyticsFlows } from './AppAnalyticsFlows';
export const analyticsModules = ['home', 'menu', 'profile', 'estimates', 'projects', 'invoices',
  'clients', 'services', 'activities', 'job-dispatch', 'job-schedule', 'reports', 'time-cards',
  'users', 'company-settings', 'billing', 'chat', 'auth', 'other', 'contracts', 'subcontractors'] as const;
export const analyticsActions = ['screen_view', 'screen_exit', 'create_open', 'preview_open',
  'save_attempt', 'save_success', 'save_error', 'send_attempt', 'send_success', 'send_error',
  'request_success', 'request_error', 'tutorial_step', 'tutorial_complete',
  'login_attempt', 'login_success', 'login_error', 'signup_attempt', 'signup_success', 'signup_error',
  'flow_open', 'flow_close', 'flow_feedback', 'action_press', 'action_attempt', 'action_success', 'action_error', 'action_cancel'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const screens = ['list', 'create', 'edit', 'preview', 'chat', 'details', 'main', 'other'];

export function parseAnalyticsEvent(input: any, now = Date.now()) {
  if (!input || !uuid.test(input.id) || !uuid.test(input.sessionId) ||
    !analyticsModules.includes(input.module) || !analyticsActions.includes(input.action) ||
    !screens.includes(input.screen) || !['ios', 'android', 'web'].includes(input.platform) ||
    !['production', 'development'].includes(input.environment) || typeof input.tutorial !== 'boolean') {
    throw new Error('Invalid analytics event');
  }
  for (const key of ['appVersion', 'releaseId']) {
    if (typeof input[key] !== 'string' || !/^[a-zA-Z0-9._-]{1,40}$/.test(input[key])) {
      throw new Error('Invalid release');
    }
  }
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > now + 300_000 ||
    occurredAt.getTime() < now - 86_400_000) throw new Error('Invalid event date');
  const durationMs = input.durationMs ?? null;
  const flow = input.flow ?? null;
  const interactionId = input.interactionId ?? null;
  if (flow !== null && (!analyticsFlows.includes(flow) || flow.split('.')[0] !== input.module))
    throw new Error('Invalid flow');
  if (interactionId !== null && !uuid.test(interactionId)) throw new Error('Invalid interaction');
  if ((input.action.startsWith('flow_') || input.action.startsWith('action_')) && !flow)
    throw new Error('Flow is required');
  if (['action_attempt', 'action_success', 'action_error', 'action_cancel'].includes(input.action) && !interactionId)
    throw new Error('Interaction is required');
  const statusCode = input.statusCode ?? null;
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > 86_400_000))
    throw new Error('Invalid duration');
  if (statusCode !== null && (!Number.isInteger(statusCode) || statusCode < 0 || statusCode > 599))
    throw new Error('Invalid status');
  // Explicit projection: never persist payloads, URLs, field contents or arbitrary metadata.
  return { id: input.id as string, sessionId: input.sessionId as string,
    module: input.module as string, action: input.action as string, screen: input.screen as string,
    platform: input.platform as string, appVersion: input.appVersion as string,
    releaseId: input.releaseId as string, environment: input.environment as string,
    tutorial: input.tutorial as boolean, durationMs: durationMs as number | null,
    statusCode: statusCode as number | null, occurredAt,
    flow: flow as string | null, interactionId: interactionId as string | null };
}

type Event = ReturnType<typeof parseAnalyticsEvent> & { userId: string; companyId: string };
export function summarizeAnalytics(events: Event[]) {
  const real = events.filter(e => !e.tutorial);
  const identified = real.filter(e => e.companyId !== 'anonymous');
  const modules = analyticsModules.map(module => {
    const rows = real.filter(e => e.module === module);
    const requests = rows.filter(e => e.action === 'request_success' || e.action === 'request_error');
    const durations = requests.map(e => e.durationMs ?? 0).sort((a, b) => a - b);
    return { module, views: rows.filter(e => e.action === 'screen_view').length,
      users: new Set(rows.filter(e => e.companyId !== 'anonymous').map(e => e.userId)).size,
      requests: requests.length, errors: requests.filter(e => e.action === 'request_error').length,
      p95Ms: durations.length ? durations[Math.ceil(durations.length * .95) - 1] : 0 };
  }).filter(m => m.views || m.requests);
  const funnels = ['estimates', 'projects', 'invoices'].map(module => {
    const sessions = new Map<string, Set<string>>();
    for (const e of real.filter(e => e.module === module)) {
      const key = e.userId + ':' + e.companyId + ':' + e.sessionId;
      const actions = sessions.get(key) ?? new Set<string>();
      actions.add(e.action);
      sessions.set(key, actions);
    }
    const count = (action: string) => [...sessions.values()].filter(a => a.has(action)).length;
    // Session reach, not a strict ordered funnel: edit/send can be legitimate entry points.
    return { module, opened: count('screen_view'), created: count('create_open'),
      previewed: count('preview_open'), attempted: count('save_attempt'),
      saved: count('save_success'), sent: count('send_success'),
      unconfirmed: [...sessions.values()].filter(a => a.has('save_attempt') && !a.has('save_success')).length };
  });
  const daily = new Map<string, Set<string>>();
  for (const e of identified) {
    const day = e.occurredAt.toISOString().slice(0, 10);
    const users = daily.get(day) ?? new Set<string>();
    users.add(e.userId);
    daily.set(day, users);
  }
  const authCount = (action: string) => new Set(real.filter(e => e.action === action).map(e => e.sessionId)).size;
  const workflows = [...new Set(identified.flatMap(e => e.flow ? [e.flow] : []))].sort().map(flow => {
    const rows = identified.filter(e => e.flow === flow);
    const count = (action: string) => rows.filter(e => e.action === action).length;
    const attempts = rows.filter(e => e.action === 'action_attempt');
    const finished = new Set(rows.filter(e => ['action_success', 'action_error', 'action_cancel'].includes(e.action))
      .map(e => e.userId + ':' + e.companyId + ':' + e.interactionId));
    return { flow, module: flow.split('.')[0], users: new Set(rows.map(e => e.userId)).size,
      opened: count('flow_open'), closed: count('flow_close'), presses: count('action_press'),
      attempts: attempts.length, succeeded: count('action_success'), failed: count('action_error'),
      canceled: count('action_cancel'), feedback: count('flow_feedback'),
      unconfirmed: attempts.filter(e => !finished.has(e.userId + ':' + e.companyId + ':' + e.interactionId)).length };
  });
  return { events: real.length, users: new Set(identified.map(e => e.userId)).size,
    sessions: new Set(identified.map(e => e.userId + ':' + e.sessionId)).size,
    authentication: { attempted: authCount('login_attempt'), succeeded: authCount('login_success'),
      failed: authCount('login_error'), signupAttempted: authCount('signup_attempt'),
      signupSucceeded: authCount('signup_success'), signupFailed: authCount('signup_error') },
    tutorialEvents: events.length - real.length, modules, funnels, workflows,
    daily: [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([day, users]) => ({ day, users: users.size })) };
}
