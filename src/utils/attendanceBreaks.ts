import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "./calculaHoraExtra";

const SHORT_BREAK_MINUTES = 15;
const PAID_SHORT_BREAKS_PER_DAY = 2;

function getAttendanceIdentity(attendance: any) {
  if (attendance?.id) return String(attendance.id);

  const userId = attendance?.user_id || attendance?.user?.id || "unknown-user";
  const dayKey = getAttendanceDayKey(attendance);
  const checkIn = attendance?.check_in_time
    ? new Date(attendance.check_in_time).toISOString()
    : "null";
  const checkOut = attendance?.check_out_time
    ? new Date(attendance.check_out_time).toISOString()
    : "null";

  return `${userId}|${dayKey}|${checkIn}|${checkOut}`;
}

function getAttendanceDayKey(attendance: any) {
  const dateValue = attendance?.date || attendance?.check_in_time;
  if (!dateValue) return "unknown-date";

  const parsedDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "unknown-date";

  return parsedDate.toISOString().slice(0, 10);
}

export function getGrossWorkedHours(attendance: any) {
  if (!attendance?.check_in_time || !attendance?.check_out_time) return 0;

  const hours = calcularHorasTrabalhadas(
    attendance.check_in_time.toISOString(),
    attendance.check_out_time.toISOString(),
    attendance.workStartTime,
    attendance.workEndTime,
    0
  );

  return convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
}

function getBreakDurationMinutes(breakRecord: any, fallbackEnd?: Date | null) {
  if (!breakRecord?.startedAt) return 0;

  const startedAt = new Date(breakRecord.startedAt);
  const endedAt = breakRecord.endedAt
    ? new Date(breakRecord.endedAt)
    : fallbackEnd || null;

  if (!endedAt || Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
    return 0;
  }

  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
}

function buildAutomaticBreakMap(attendances: any[]) {
  const breakByAttendance = new Map<string, number>();
  const groupedAttendances = new Map<string, any[]>();

  attendances.forEach((attendance) => {
    const identity = getAttendanceIdentity(attendance);
    const userId = attendance?.user_id || attendance?.user?.id || "unknown-user";
    const groupKey = `${userId}|${getAttendanceDayKey(attendance)}`;

    breakByAttendance.set(identity, 0);

    if (!groupedAttendances.has(groupKey)) groupedAttendances.set(groupKey, []);
    groupedAttendances.get(groupKey)!.push(attendance);
  });

  groupedAttendances.forEach((group) => {
    const sortedAttendances = [...group].sort(
      (a, b) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime()
    );

    const breakTarget = sortedAttendances.find(
      (attendance) =>
        !attendance?.user?.manualBreakEnabled && getGrossWorkedHours(attendance) > 0
    );

    if (!breakTarget) return;

    const grossWorkedMinutes = Math.round(getGrossWorkedHours(breakTarget) * 60);
    const breakMinutesApplied = Math.min(
      breakTarget?.user?.defaultBreakMinutes || 0,
      grossWorkedMinutes
    );

    breakByAttendance.set(getAttendanceIdentity(breakTarget), breakMinutesApplied);
  });

  return breakByAttendance;
}

function buildManualBreakMap(attendances: any[]) {
  const breakByAttendance = new Map<string, number>();
  const groupedAttendances = new Map<string, any[]>();

  attendances.forEach((attendance) => {
    if (!attendance?.user?.manualBreakEnabled) return;

    const userId = attendance?.user_id || attendance?.user?.id || "unknown-user";
    const groupKey = `${userId}|${getAttendanceDayKey(attendance)}`;

    if (!groupedAttendances.has(groupKey)) groupedAttendances.set(groupKey, []);
    groupedAttendances.get(groupKey)!.push(attendance);
  });

  groupedAttendances.forEach((group) => {
    let paidShortBreaksUsed = 0;
    const sortedBreakEntries = group
      .flatMap((attendance) =>
        (attendance.breakRecords || []).map((breakRecord: any) => ({
          attendance,
          breakRecord,
          durationMinutes: getBreakDurationMinutes(breakRecord, attendance.check_out_time),
        }))
      )
      .filter((entry) => entry.durationMinutes > 0)
      .sort(
        (a, b) =>
          new Date(a.breakRecord.startedAt).getTime() -
          new Date(b.breakRecord.startedAt).getTime()
      );

    sortedBreakEntries.forEach((entry) => {
      let deductibleMinutes = entry.durationMinutes;

      if (
        entry.durationMinutes < SHORT_BREAK_MINUTES &&
        paidShortBreaksUsed < PAID_SHORT_BREAKS_PER_DAY
      ) {
        paidShortBreaksUsed += 1;
        deductibleMinutes = 0;
      }

      const attendanceIdentity = getAttendanceIdentity(entry.attendance);
      const current = breakByAttendance.get(attendanceIdentity) || 0;
      breakByAttendance.set(attendanceIdentity, current + deductibleMinutes);
    });
  });

  attendances.forEach((attendance) => {
    if (attendance?.user?.manualBreakEnabled && !breakByAttendance.has(getAttendanceIdentity(attendance))) {
      breakByAttendance.set(getAttendanceIdentity(attendance), 0);
    }
  });

  return breakByAttendance;
}

export function applyEffectiveBreaksToAttendances(attendances: any[]) {
  const automaticBreaks = buildAutomaticBreakMap(attendances);
  const manualBreaks = buildManualBreakMap(attendances);

  attendances.forEach((attendance) => {
    if (!attendance?.user) return;

    const identity = getAttendanceIdentity(attendance);
    const grossWorkedMinutes = Math.round(getGrossWorkedHours(attendance) * 60);
    const effectiveBreakMinutes = attendance.user.manualBreakEnabled
      ? manualBreaks.get(identity) || 0
      : automaticBreaks.get(identity) || 0;
    const cappedBreakMinutes = Math.min(effectiveBreakMinutes, grossWorkedMinutes);

    attendance.__rawDailyHours = grossWorkedMinutes / 60;
    attendance.__breakMinutesApplied = cappedBreakMinutes;
    attendance.user = {
      ...attendance.user,
      defaultBreakMinutes: cappedBreakMinutes,
    };
  });

  return attendances;
}
