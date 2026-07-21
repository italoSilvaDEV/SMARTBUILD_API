import { prisma } from "../utils/prisma";

const MAX_CONTINUOUS_GAP_MS = 30 * 60_000;
const MAX_FINAL_POINT_EXTENSION_MS = 5 * 60_000;
const MAX_CONTINUOUS_DISTANCE_METERS = 5_000;

export type PresenceAttendanceWindow = {
  attendanceId: string;
  userId: string;
  userServiceProjectId?: string | null;
  checkInAt: Date;
  checkOutAt?: Date | null;
};

export type PresencePoint = {
  recordedAt: Date;
  isInsideSite: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type AttendancePresenceSummary = {
  totalMinutes: number;
  insideMinutes: number;
  outsideMinutes: number;
  untrackedMinutes: number;
  pointCount: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(left: PresencePoint, right: PresencePoint) {
  if (
    left.latitude == null ||
    left.longitude == null ||
    right.latitude == null ||
    right.longitude == null
  ) {
    return 0;
  }

  const earthRadiusMeters = 6_371_000;
  const deltaLat = toRadians(right.latitude - left.latitude);
  const deltaLng = toRadians(right.longitude - left.longitude);
  const leftLat = toRadians(left.latitude);
  const rightLat = toRadians(right.latitude);
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function clampDate(value: Date, minimum: Date, maximum: Date) {
  return new Date(Math.min(maximum.getTime(), Math.max(minimum.getTime(), value.getTime())));
}

export function calculateAttendancePresenceSummary(
  points: PresencePoint[],
  windowStart: Date,
  windowEnd: Date
): AttendancePresenceSummary {
  const startMs = windowStart.getTime();
  const endMs = Math.max(startMs, windowEnd.getTime());
  const normalizedPoints = points
    .filter((point) => {
      const timestamp = point.recordedAt.getTime();
      return Number.isFinite(timestamp) && timestamp >= startMs && timestamp <= endMs;
    })
    .sort((left, right) => left.recordedAt.getTime() - right.recordedAt.getTime());

  let insideMs = 0;
  let outsideMs = 0;

  const addDuration = (point: PresencePoint, durationMs: number) => {
    if (durationMs <= 0 || point.isInsideSite == null) return;
    if (point.isInsideSite) insideMs += durationMs;
    else outsideMs += durationMs;
  };

  for (let index = 0; index < normalizedPoints.length - 1; index += 1) {
    const current = normalizedPoints[index];
    const next = normalizedPoints[index + 1];
    const durationMs = next.recordedAt.getTime() - current.recordedAt.getTime();

    if (durationMs <= 0 || durationMs >= MAX_CONTINUOUS_GAP_MS) continue;
    if (getDistanceMeters(current, next) >= MAX_CONTINUOUS_DISTANCE_METERS) continue;
    addDuration(current, durationMs);
  }

  const lastPoint = normalizedPoints[normalizedPoints.length - 1];
  if (lastPoint) {
    const finalDurationMs = Math.min(
      MAX_FINAL_POINT_EXTENSION_MS,
      Math.max(0, endMs - lastPoint.recordedAt.getTime())
    );
    addDuration(lastPoint, finalDurationMs);
  }

  const totalMinutes = Math.max(0, Math.floor((endMs - startMs) / 60_000));
  const insideMinutes = Math.max(0, Math.floor(insideMs / 60_000));
  const outsideMinutes = Math.max(0, Math.floor(outsideMs / 60_000));

  return {
    totalMinutes,
    insideMinutes,
    outsideMinutes,
    untrackedMinutes: Math.max(0, totalMinutes - insideMinutes - outsideMinutes),
    pointCount: normalizedPoints.length,
  };
}

export async function getAttendancePresenceSummaries(
  companyId: string,
  attendanceWindows: PresenceAttendanceWindow[],
  requestedStart: Date,
  requestedEnd: Date,
  now = new Date()
) {
  if (attendanceWindows.length === 0) {
    return new Map<string, AttendancePresenceSummary>();
  }

  const windows = attendanceWindows.map((attendance) => {
    const windowStart = clampDate(attendance.checkInAt, requestedStart, requestedEnd);
    const attendanceEnd = attendance.checkOutAt || now;
    const windowEnd = clampDate(attendanceEnd, windowStart, requestedEnd);
    return { ...attendance, windowStart, windowEnd };
  });
  const earliestStart = new Date(Math.min(...windows.map((window) => window.windowStart.getTime())));
  const latestEnd = new Date(Math.max(...windows.map((window) => window.windowEnd.getTime())));
  const attendanceIds = windows.map((window) => window.attendanceId);

  const modernRows = await prisma.workerLocationPing.findMany({
    where: {
      companyId,
      attendanceId: { in: attendanceIds },
      recordedAt: { gte: earliestStart, lte: latestEnd },
    },
    select: {
      attendanceId: true,
      recordedAt: true,
      isInsideSite: true,
      latitude: true,
      longitude: true,
    },
    orderBy: [{ attendanceId: "asc" }, { recordedAt: "asc" }],
  });

  const modernByAttendance = new Map<string, PresencePoint[]>();
  modernRows.forEach((row) => {
    if (!row.attendanceId) return;
    const points = modernByAttendance.get(row.attendanceId) || [];
    points.push(row);
    modernByAttendance.set(row.attendanceId, points);
  });

  const fallbackWindows = windows.filter(
    (window) => !(modernByAttendance.get(window.attendanceId)?.length)
  );
  const fallbackAssignmentIds = Array.from(
    new Set(
      fallbackWindows
        .map((window) => window.userServiceProjectId)
        .filter((value): value is string => Boolean(value))
    )
  );
  const legacyRows = fallbackAssignmentIds.length
    ? await prisma.timeLine.findMany({
        where: {
          userServiceProjectId: { in: fallbackAssignmentIds },
          check_in_time: { gte: earliestStart, lte: latestEnd },
        },
        select: {
          userServiceProjectId: true,
          check_in_time: true,
          is_local_work: true,
          check_in_latitude: true,
          check_in_longitude: true,
        },
        orderBy: [{ userServiceProjectId: "asc" }, { check_in_time: "asc" }],
      })
    : [];
  const legacyByAssignment = new Map<string, PresencePoint[]>();
  legacyRows.forEach((row) => {
    const points = legacyByAssignment.get(row.userServiceProjectId) || [];
    points.push({
      recordedAt: row.check_in_time,
      isInsideSite: row.is_local_work,
      latitude: row.check_in_latitude,
      longitude: row.check_in_longitude,
    });
    legacyByAssignment.set(row.userServiceProjectId, points);
  });

  return new Map(
    windows.map((window) => {
      const points =
        modernByAttendance.get(window.attendanceId) ||
        (window.userServiceProjectId
          ? legacyByAssignment.get(window.userServiceProjectId) || []
          : []);
      return [
        window.attendanceId,
        calculateAttendancePresenceSummary(points, window.windowStart, window.windowEnd),
      ];
    })
  );
}
