import { parseAnalyticsEvent, summarizeAnalytics } from './AppAnalyticsService';

test('flows reject arbitrary values and preserve old clients', () => {
  expect(parseAnalyticsEvent(event).flow).toBeNull();
  expect(() => parseAnalyticsEvent({ ...event, flow: 'estimates.customer-private-name' })).toThrow();
  expect(() => parseAnalyticsEvent({ ...event, flow: 'clients.create' })).toThrow();
  expect(() => parseAnalyticsEvent({ ...event, action: 'action_attempt' })).toThrow();
});

test('workflow outcomes correlate attempts, excluding tutorials and other companies', () => {
  const row = { ...parseAnalyticsEvent({ ...event, action: 'action_attempt', flow: 'estimates.create', interactionId: event.id }), userId: 'u1', companyId: 'c1' };
  const result = summarizeAnalytics([row, { ...row, action: 'action_success', companyId: 'c2' }, { ...row, action: 'action_error', tutorial: true }]);
  expect(result.workflows[0]).toMatchObject({ attempts: 1, succeeded: 1, failed: 0, unconfirmed: 1 });
  expect(summarizeAnalytics([row, { ...row, action: 'action_error' }]).workflows[0]).toMatchObject({ attempts: 1, failed: 1, unconfirmed: 0 });
});

const event = {
  id: 'a0000000-0000-0000-0000-000000000001',
  sessionId: 'b0000000-0000-0000-0000-000000000001',
  module: 'estimates', screen: 'create', action: 'save_attempt', platform: 'ios',
  appVersion: '1.0.0', releaseId: 'embedded', environment: 'production',
  tutorial: false, occurredAt: new Date().toISOString(),
};
test('projects only allowed fields and rejects free text routes and invalid dates', () => {
  const parsed = parseAnalyticsEvent({ ...event, password: 'secret', body: 'private' });
  expect(parsed).not.toHaveProperty('password');
  expect(parsed).not.toHaveProperty('body');
  expect(() => parseAnalyticsEvent({ ...event, screen: '/clients/private-name' })).toThrow();
  expect(() => parseAnalyticsEvent({ ...event, durationMs: -1 })).toThrow();
  expect(() => parseAnalyticsEvent({ ...event, occurredAt: 'invalid' })).toThrow();
});
test('tutorials excluded; retry success is not counted as an unconfirmed save', () => {
  const row = { ...parseAnalyticsEvent(event), userId: 'user', companyId: 'company' };
  const result = summarizeAnalytics([row, { ...row, action: 'save_error' },
    { ...row, action: 'save_success' }, { ...row, tutorial: true, action: 'screen_view' }]);
  expect(result.tutorialEvents).toBe(1);
  expect(result.funnels[0]).toMatchObject({ attempted: 1, saved: 1, unconfirmed: 0, opened: 0 });
});
test('company boundaries do not merge different journeys', () => {
  const row = { ...parseAnalyticsEvent(event), userId: 'user', companyId: 'a' };
  const result = summarizeAnalytics([row, { ...row, companyId: 'b', action: 'save_success' }]);
  expect(result.funnels[0].unconfirmed).toBe(1);
});
