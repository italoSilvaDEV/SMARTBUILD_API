import {
  clipTimecardAttendance,
  getOriginalTimecardFields,
  keepAutomaticBreakInStartPeriod,
  timecardOverlapWhere,
} from './timecardRange';

const originalCheckIn = new Date('2026-11-13T06:22:58.652-05:00');
const originalCheckOut = new Date('2026-11-16T06:17:32.184-05:00');

function attendance() {
  return {
    id: 'cross-week',
    check_in_time: originalCheckIn,
    check_out_time: originalCheckOut,
    date: originalCheckIn,
    user: { manualBreakEnabled: false, defaultBreakMinutes: 30 },
    breakRecords: [] as any[],
  };
}

test('a cross-week point is visible in both periods while each gets only its own duration', () => {
  const first = clipTimecardAttendance(
    attendance(),
    new Date('2026-11-08T00:00:00-05:00'),
    new Date('2026-11-14T23:59:59.999-05:00'),
  );
  const second = clipTimecardAttendance(
    attendance(),
    new Date('2026-11-15T00:00:00-05:00'),
    new Date('2026-11-21T23:59:59.999-05:00'),
  );

  expect(first.check_out_time?.toISOString()).toBe('2026-11-15T05:00:00.000Z');
  expect(second.check_in_time.toISOString()).toBe('2026-11-15T05:00:00.000Z');
  const firstMs = first.check_out_time!.getTime() - first.check_in_time.getTime();
  const secondMs = second.check_out_time!.getTime() - second.check_in_time.getTime();
  expect(firstMs + secondMs).toBe(originalCheckOut.getTime() - originalCheckIn.getTime());
  expect(getOriginalTimecardFields(first)).toMatchObject({ checkIn: originalCheckIn, checkOut: originalCheckOut });
  expect(getOriginalTimecardFields(second)).toMatchObject({ checkIn: originalCheckIn, checkOut: originalCheckOut });

  keepAutomaticBreakInStartPeriod([first, second]);
  expect(first.user.defaultBreakMinutes).toBe(30);
  expect(second.user.defaultBreakMinutes).toBe(0);
});

test('the query uses interval intersection and does not count a boundary twice', () => {
  const start = new Date('2026-11-15T00:00:00-05:00');
  const end = new Date('2026-11-21T23:59:59.999-05:00');
  expect(timecardOverlapWhere(start, end)).toEqual({
    check_in_time: { lt: new Date('2026-11-22T00:00:00-05:00') },
    OR: [{ check_out_time: null }, { check_out_time: { gt: start } }],
  });
});
