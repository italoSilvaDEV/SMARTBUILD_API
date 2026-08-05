import {
  ATTENDANCE_FUTURE_TOLERANCE_MS,
  MAX_CLOSED_ATTENDANCE_DURATION_MS,
  validateAttendanceTimeRange,
} from '../../src/utils/attendanceTimeValidation';

describe('validateAttendanceTimeRange', () => {
  const now = new Date('2026-08-05T15:00:00.000Z');

  it('accepts a normal historical closed shift', () => {
    expect(validateAttendanceTimeRange(
      new Date('2026-08-04T11:00:00.000Z'),
      new Date('2026-08-04T20:00:00.000Z'),
      { now }
    )).toBeNull();
  });

  it('rejects a future checkout like the corrupted Luiz attendance', () => {
    expect(validateAttendanceTimeRange(
      new Date('2026-04-09T11:20:28.680Z'),
      new Date('2026-09-04T21:00:00.000Z'),
      { now }
    )).toBe('CHECK_OUT_FUTURE');
  });

  it('rejects a closed shift longer than twenty-four hours', () => {
    expect(validateAttendanceTimeRange(
      new Date('2026-08-03T10:00:00.000Z'),
      new Date('2026-08-04T10:00:00.001Z'),
      { now }
    )).toBe('ATTENDANCE_DURATION_EXCEEDED');
  });

  it('allows exactly twenty-four hours and the configured clock skew', () => {
    expect(validateAttendanceTimeRange(
      new Date(now.getTime() + ATTENDANCE_FUTURE_TOLERANCE_MS),
      null,
      { now }
    )).toBeNull();

    const checkIn = new Date('2026-08-03T10:00:00.000Z');
    expect(validateAttendanceTimeRange(
      checkIn,
      new Date(checkIn.getTime() + MAX_CLOSED_ATTENDANCE_DURATION_MS),
      { now }
    )).toBeNull();
  });

  it('rejects reversed or invalid ranges', () => {
    expect(validateAttendanceTimeRange(
      new Date('2026-08-04T20:00:00.000Z'),
      new Date('2026-08-04T11:00:00.000Z'),
      { now }
    )).toBe('CHECK_OUT_BEFORE_CHECK_IN');

    expect(validateAttendanceTimeRange(new Date('invalid'), null, { now }))
      .toBe('INVALID_ATTENDANCE_TIME');
  });
});
