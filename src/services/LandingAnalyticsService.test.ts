import { parseLandingEvent, summarizeLanding } from './LandingAnalyticsService';
const event = { id:'a0000000-0000-4000-8000-000000000001', sessionId:'b0000000-0000-4000-8000-000000000001',
  action:'session_start', environment:'development', device:'desktop', occurredAt:new Date().toISOString() };
test('discards unknown fields and rejects arbitrary labels and invalid timestamps', () => {
  expect(parseLandingEvent({...event,email:'private@example.com'})).not.toHaveProperty('email');
  expect(() => parseLandingEvent({...event,section:'private user text'})).toThrow();
  expect(() => parseLandingEvent({...event,occurredAt:'invalid'})).toThrow();
});
test('counts sessions, section reach and cumulative active time without double counting', () => {
  const rows = [event,{...event,action:'section_view',section:'hero',sectionIndex:0},
    {...event,action:'section_view',section:'plans',sectionIndex:1},
    {...event,action:'cta_click',section:'plans',sectionIndex:1,target:'get-started'},
    {...event,action:'session_end',durationMs:5000},{...event,action:'session_end',durationMs:15000},
    {...event,action:'scroll',value:75}].map(parseLandingEvent);
  const result = summarizeLanding(rows);
  expect(result.sessions).toBe(1); expect(result.ctaRate).toBe(100);
  expect(result.medianActiveMs).toBe(15000); expect(result.engagedSessions).toBe(1);
  expect(result.sections.map(s => s.stoppedHere)).toEqual([0,1]);
  expect(result.scroll.find(s => s.depth === 50)?.sessions).toBe(1);
});
test('ranks named buttons and averages reading time per session, including older controls', () => {
  const secondSession = 'b0000000-0000-4000-8000-000000000002';
  const rows = [
    {...event, action:'section_view', section:'schedule-demo', sectionIndex:1},
    {...event, action:'section_exit', section:'schedule-demo', sectionIndex:1, durationMs:4000},
    {...event, action:'section_exit', section:'schedule-demo', sectionIndex:1, durationMs:6000},
    {...event, action:'demo', section:'schedule-demo', target:'control-47'},
    {...event, action:'demo', section:'schedule-demo', target:'schedule-demo-save-and-send'},
    {...event, sessionId:secondSession, action:'section_view', section:'schedule-demo', sectionIndex:1},
    {...event, sessionId:secondSession, action:'section_exit', section:'schedule-demo', sectionIndex:1, durationMs:2000},
    {...event, sessionId:secondSession, action:'demo', section:'schedule-demo', target:'control-47'},
    {...event, sessionId:secondSession, action:'demo', section:'schedule-demo', target:'control-46'},
  ].map(parseLandingEvent);
  const result = summarizeLanding(rows);
  expect(result.sections[0].avgDwellMs).toBe(6000);
  expect(result.buttons[0]).toMatchObject({id:'schedule-demo-save-and-send',clicks:3,sessions:2});
  expect(result.buttons[1]).toMatchObject({id:'legacy-interaction',clicks:1});
});
test('keeps section drop-off correct across page versions and ranks video controls', () => {
  const secondSession = 'b0000000-0000-4000-8000-000000000002';
  const rows = [
    {...event, action:'section_view', section:'our-world', sectionIndex:6},
    {...event, action:'video', section:'our-world', sectionIndex:6, target:'our-world-rony-play'},
    {...event, sessionId:secondSession, action:'section_view', section:'our-world', sectionIndex:5},
    {...event, sessionId:secondSession, action:'video', section:'our-world', sectionIndex:5, target:'our-world-rony-play'},
  ].map(parseLandingEvent);
  const result = summarizeLanding(rows);
  expect(result.sections[0].stoppedHere).toBe(2);
  expect(result.buttons[0]).toMatchObject({id:'our-world-rony-play',clicks:2,sessions:2});
});
