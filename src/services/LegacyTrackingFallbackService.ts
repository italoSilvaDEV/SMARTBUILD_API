import { prisma } from "../utils/prisma";

export type LegacyTrackingFallbackAttendance = {
  id: string;
  user_id: string;
  user_service_project_id?: string | null;
  check_in_time: Date;
};

export type LegacyTrackingFallbackRow = {
  id: string;
  user_id: string;
  userServiceProjectId: string;
  service_project_id: string;
  check_in_time: Date;
  check_in_latitude: number;
  check_in_longitude: number;
  is_local_work: boolean;
};

function assignmentKey(userId: string, userServiceProjectId: string) {
  return `${userId}:${userServiceProjectId}`;
}

/**
 * Loads at most one legacy Timeline row per requested attendance assignment.
 * Callers should pass only attendances without a valid modern live row.
 */
export async function getLatestLegacyTrackingFallbacks(
  attendances: LegacyTrackingFallbackAttendance[]
): Promise<Map<string, LegacyTrackingFallbackRow>> {
  const eligibleAttendances = attendances.filter(
    (attendance) => !!attendance.user_service_project_id
  );
  if (!eligibleAttendances.length) return new Map();

  const assignments = Array.from(
    eligibleAttendances
      .reduce((unique, attendance) => {
        const userServiceProjectId = attendance.user_service_project_id as string;
        unique.set(assignmentKey(attendance.user_id, userServiceProjectId), {
          user_id: attendance.user_id,
          userServiceProjectId,
        });
        return unique;
      }, new Map<string, { user_id: string; userServiceProjectId: string }>())
      .values()
  );
  const earliestCheckIn = eligibleAttendances.reduce(
    (earliest, attendance) =>
      attendance.check_in_time.getTime() < earliest.getTime()
        ? attendance.check_in_time
        : earliest,
    eligibleAttendances[0].check_in_time
  );

  const latestTimestamps = await prisma.timeLine.groupBy({
    by: ["user_id", "userServiceProjectId"],
    where: {
      check_in_time: { gte: earliestCheckIn },
      OR: assignments,
    },
    _max: { check_in_time: true },
  });

  const latestFilters = latestTimestamps.flatMap((row) =>
    row._max.check_in_time
      ? [{
          user_id: row.user_id,
          userServiceProjectId: row.userServiceProjectId,
          check_in_time: row._max.check_in_time,
        }]
      : []
  );
  if (!latestFilters.length) return new Map();

  const latestRows = await prisma.timeLine.findMany({
    where: { OR: latestFilters },
    select: {
      id: true,
      user_id: true,
      userServiceProjectId: true,
      service_project_id: true,
      check_in_time: true,
      check_in_latitude: true,
      check_in_longitude: true,
      is_local_work: true,
    },
    orderBy: { check_in_time: "desc" },
  });
  const latestRowByAssignment = new Map<string, LegacyTrackingFallbackRow>();
  for (const row of latestRows) {
    const key = assignmentKey(row.user_id, row.userServiceProjectId);
    if (!latestRowByAssignment.has(key)) {
      latestRowByAssignment.set(key, row);
    }
  }

  const byAttendanceId = new Map<string, LegacyTrackingFallbackRow>();
  for (const attendance of eligibleAttendances) {
    const row = latestRowByAssignment.get(
      assignmentKey(attendance.user_id, attendance.user_service_project_id as string)
    );
    if (row && row.check_in_time.getTime() >= attendance.check_in_time.getTime()) {
      byAttendanceId.set(attendance.id, row);
    }
  }
  return byAttendanceId;
}
