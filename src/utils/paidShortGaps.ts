const PAID_SHORT_GAP_LIMIT_MINUTES = 20;

function getAttendanceIdentity(attendance: any) {
  if (attendance?.id) return String(attendance.id);

  const userId = attendance?.user_id || attendance?.user?.id || "unknown-user";
  const checkIn = attendance?.check_in_time
    ? new Date(attendance.check_in_time).toISOString()
    : "null";
  const checkOut = attendance?.check_out_time
    ? new Date(attendance.check_out_time).toISOString()
    : "null";

  return `${userId}|${checkIn}|${checkOut}`;
}

function getAttendanceDayKey(attendance: any) {
  const dateValue = attendance?.check_in_time || attendance?.date;
  if (!dateValue) return "unknown-date";

  const parsedDate = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return "unknown-date";

  return parsedDate.toISOString().slice(0, 10);
}

function getAttendanceUserId(attendance: any) {
  return attendance?.user_id || attendance?.user?.id || "unknown-user";
}

export function getPaidShortGapMinutes(attendance: any) {
  const minutes = Number(attendance?.__paidShortGapMinutes || 0);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

export function getPaidShortGapHours(attendance: any) {
  return getPaidShortGapMinutes(attendance) / 60;
}

export function getPaidShortGapEligibleAt(attendance: any): Date | null {
  const value = attendance?.__paidShortGapEligibleAt;
  if (!value) return null;

  const parsedDate = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

export function applyPaidShortGapsToAttendances(attendances: any[]) {
  const paidGapByAttendance = new Map<string, number>();
  const paidGapEligibleAtByAttendance = new Map<string, Date>();
  const groupedAttendances = new Map<string, any[]>();
  const identitiesByGroup = new Map<string, Set<string>>();

  attendances.forEach((attendance) => {
    const identity = getAttendanceIdentity(attendance);
    const userId = getAttendanceUserId(attendance);
    const groupKey = `${userId}|${getAttendanceDayKey(attendance)}`;

    paidGapByAttendance.set(identity, 0);

    if (!groupedAttendances.has(groupKey)) {
      groupedAttendances.set(groupKey, []);
      identitiesByGroup.set(groupKey, new Set<string>());
    }

    if (!identitiesByGroup.get(groupKey)!.has(identity)) {
      identitiesByGroup.get(groupKey)!.add(identity);
      groupedAttendances.get(groupKey)!.push(attendance);
    }
  });

  groupedAttendances.forEach((group) => {
    const sortedAttendances = [...group].sort(
      (a, b) => new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime()
    );

    for (let index = 0; index < sortedAttendances.length - 1; index += 1) {
      const current = sortedAttendances[index];
      const next = sortedAttendances[index + 1];

      if (current?.user?.paidShortGapEnabled === false) continue;
      if (!current?.check_out_time || !next?.check_in_time) continue;

      const currentOut = new Date(current.check_out_time).getTime();
      const nextIn = new Date(next.check_in_time).getTime();

      if (Number.isNaN(currentOut) || Number.isNaN(nextIn)) continue;

      const gapMinutes = Math.round((nextIn - currentOut) / 60000);
      if (gapMinutes <= 0 || gapMinutes > PAID_SHORT_GAP_LIMIT_MINUTES) continue;

      const currentIdentity = getAttendanceIdentity(current);
      paidGapByAttendance.set(
        currentIdentity,
        (paidGapByAttendance.get(currentIdentity) || 0) + gapMinutes
      );

      // A historical dashboard bucket only contains the next attendance after
      // that record itself satisfies the bucket query. Keep that eligibility
      // boundary so a single full-range read can reproduce every old bucket.
      const nextOut = next?.check_out_time
        ? new Date(next.check_out_time).getTime()
        : nextIn;
      paidGapEligibleAtByAttendance.set(
        currentIdentity,
        new Date(Math.max(nextIn, nextOut))
      );
    }
  });

  attendances.forEach((attendance) => {
    const identity = getAttendanceIdentity(attendance);
    attendance.__paidShortGapMinutes = paidGapByAttendance.get(identity) || 0;
    Object.defineProperty(attendance, "__paidShortGapEligibleAt", {
      configurable: true,
      enumerable: false,
      value: paidGapEligibleAtByAttendance.get(identity) || null,
      writable: true,
    });
  });

  return attendances;
}
