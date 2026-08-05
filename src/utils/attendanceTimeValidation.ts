export const MAX_CLOSED_ATTENDANCE_DURATION_MS = 24 * 60 * 60 * 1000;
export const ATTENDANCE_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export type AttendanceTimeValidationError =
  | 'INVALID_ATTENDANCE_TIME'
  | 'CHECK_IN_FUTURE'
  | 'CHECK_OUT_FUTURE'
  | 'CHECK_OUT_BEFORE_CHECK_IN'
  | 'ATTENDANCE_DURATION_EXCEEDED';

interface AttendanceTimeValidationOptions {
  now?: Date;
  futureToleranceMs?: number;
  maxClosedDurationMs?: number;
}

export function validateAttendanceTimeRange(
  checkIn: Date,
  checkOut: Date | null,
  options: AttendanceTimeValidationOptions = {}
): AttendanceTimeValidationError | null {
  if (Number.isNaN(checkIn.getTime()) || (checkOut && Number.isNaN(checkOut.getTime()))) {
    return 'INVALID_ATTENDANCE_TIME';
  }

  const now = options.now ?? new Date();
  const futureToleranceMs = options.futureToleranceMs ?? ATTENDANCE_FUTURE_TOLERANCE_MS;
  const maxClosedDurationMs = options.maxClosedDurationMs ?? MAX_CLOSED_ATTENDANCE_DURATION_MS;
  const latestAllowedTime = now.getTime() + futureToleranceMs;

  if (checkIn.getTime() > latestAllowedTime) {
    return 'CHECK_IN_FUTURE';
  }

  if (!checkOut) {
    return null;
  }

  if (checkOut.getTime() > latestAllowedTime) {
    return 'CHECK_OUT_FUTURE';
  }

  if (checkOut.getTime() <= checkIn.getTime()) {
    return 'CHECK_OUT_BEFORE_CHECK_IN';
  }

  if (checkOut.getTime() - checkIn.getTime() > maxClosedDurationMs) {
    return 'ATTENDANCE_DURATION_EXCEEDED';
  }

  return null;
}
