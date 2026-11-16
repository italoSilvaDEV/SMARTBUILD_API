import { Prisma } from '@prisma/client';

// A time entry belongs to a report whenever part of it intersects the selected period.
// Use a half-open interval so an entry ending at midnight belongs to only one period.
export function timecardOverlapWhere(start: Date, endInclusive: Date): Prisma.UserAttendanceWhereInput {
  const endExclusive = new Date(endInclusive.getTime() + 1);
  return {
    check_in_time: { lt: endExclusive },
    OR: [
      { check_out_time: null },
      { check_out_time: { gt: start } },
    ],
  };
}

export function clipTimecardAttendance<T extends {
  check_in_time: Date;
  check_out_time: Date | null;
  date: Date;
  breakRecords?: any[];
}>(attendance: T, start: Date, endInclusive: Date): T {
  const endExclusive = new Date(endInclusive.getTime() + 1);
  const originalCheckIn = attendance.check_in_time;
  const originalCheckOut = attendance.check_out_time;
  const originalDate = attendance.date;
  const originalBreakRecords = attendance.breakRecords;
  const clippedCheckIn = new Date(Math.max(originalCheckIn.getTime(), start.getTime()));
  const clippedCheckOut = originalCheckOut
    ? new Date(Math.min(originalCheckOut.getTime(), endExclusive.getTime()))
    : null;

  Object.defineProperties(attendance, {
    __originalCheckInTime: { value: originalCheckIn, configurable: true },
    __originalCheckOutTime: { value: originalCheckOut, configurable: true },
    __originalDate: { value: originalDate, configurable: true },
    __originalBreakRecords: { value: originalBreakRecords, configurable: true },
    __isContinuation: { value: originalCheckIn < start, configurable: true },
  });

  attendance.check_in_time = clippedCheckIn;
  attendance.check_out_time = clippedCheckOut;
  attendance.date = clippedCheckIn;
  if (originalBreakRecords) {
    attendance.breakRecords = originalBreakRecords
      .filter(record => record.startedAt < endExclusive && (!record.endedAt || record.endedAt > start))
      .map(record => ({
        ...record,
        startedAt: new Date(Math.max(record.startedAt.getTime(), start.getTime())),
        endedAt: record.endedAt
          ? new Date(Math.min(record.endedAt.getTime(), endExclusive.getTime()))
          : null,
      }));
  }
  return attendance;
}

export function getOriginalTimecardFields(attendance: any) {
  return {
    checkIn: attendance.__originalCheckInTime || attendance.check_in_time,
    checkOut: attendance.__originalCheckOutTime === undefined
      ? attendance.check_out_time : attendance.__originalCheckOutTime,
    date: attendance.__originalDate || attendance.date,
    breaks: attendance.__originalBreakRecords || attendance.breakRecords || [],
  };
}

export function keepAutomaticBreakInStartPeriod(attendances: any[]) {
  for (const attendance of attendances) {
    if (!attendance.__isContinuation || attendance.user?.manualBreakEnabled || !attendance.user) continue;
    attendance.__breakMinutesApplied = 0;
    attendance.user = { ...attendance.user, defaultBreakMinutes: 0 };
  }
}
