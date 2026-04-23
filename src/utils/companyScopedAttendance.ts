import { prisma } from "./prisma";
import {
  AttendanceDailyBreakInput,
  buildAttendanceBaseMetricsByAttendance,
} from "./attendanceDailyBreak";
import { calculateWeeklyOvertimePerAttendance } from "./calculateWeeklyOvertime";

type CompanyScopedAttendanceInput = AttendanceDailyBreakInput & {
  isOvertime?: boolean | null;
  user?: {
    id?: string | null;
    hourly_price?: number | null;
    defaultBreakMinutes?: number | null;
  } | null;
};

type RelatedAttendanceRow = {
  id: string;
  user_id: string;
  date: Date;
  check_in_time: Date;
  check_out_time: Date | null;
  workStartTime: string | null;
  workEndTime: string | null;
  isOvertime: boolean | null;
  user: {
    id: string;
    hourly_price: number | null;
    defaultBreakMinutes: number | null;
  };
};

function toValidDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getScopedUserId(attendance: CompanyScopedAttendanceInput): string | null {
  return attendance.user_id || attendance.user?.id || null;
}

function getScopedDateKey(attendance: CompanyScopedAttendanceInput): string | null {
  const date = toValidDate(attendance.date);
  if (date) {
    return date.toISOString();
  }

  const checkIn = toValidDate(attendance.check_in_time);
  if (!checkIn) {
    return null;
  }

  const normalizedDate = new Date(Date.UTC(
    checkIn.getUTCFullYear(),
    checkIn.getUTCMonth(),
    checkIn.getUTCDate()
  ));

  return normalizedDate.toISOString();
}

function mapSubsetToFallbackOvertime(attendances: CompanyScopedAttendanceInput[]) {
  const baseMetrics = buildAttendanceBaseMetricsByAttendance(attendances);
  return {
    attendanceMetrics: baseMetrics,
    overtimePerAttendance: calculateWeeklyOvertimePerAttendance(attendances as any[], baseMetrics),
  };
}

export async function buildCompanyScopedAttendanceContext(
  companyId: string | null | undefined,
  attendances: CompanyScopedAttendanceInput[]
) {
  if (!companyId || !attendances.length) {
    return mapSubsetToFallbackOvertime(attendances);
  }

  const userIds = new Set<string>();
  const dateKeys = new Set<string>();

  for (const attendance of attendances) {
    const userId = getScopedUserId(attendance);
    const dateKey = getScopedDateKey(attendance);

    if (userId) userIds.add(userId);
    if (dateKey) dateKeys.add(dateKey);
  }

  if (!userIds.size || !dateKeys.size) {
    return mapSubsetToFallbackOvertime(attendances);
  }

  const relatedAttendances = await prisma.userAttendance.findMany({
    where: {
      user_id: {
        in: Array.from(userIds),
      },
      date: {
        in: Array.from(dateKeys).map((value) => new Date(value)),
      },
      UserServiceProject: {
        service_project: {
          company_id: companyId,
        },
      },
    },
    select: {
      id: true,
      user_id: true,
      date: true,
      check_in_time: true,
      check_out_time: true,
      workStartTime: true,
      workEndTime: true,
      isOvertime: true,
      user: {
        select: {
          id: true,
          hourly_price: true,
          defaultBreakMinutes: true,
        },
      },
    },
  });

  const scopedAttendances: RelatedAttendanceRow[] = relatedAttendances.length
    ? relatedAttendances
    : (attendances as RelatedAttendanceRow[]);

  const attendanceMetrics = buildAttendanceBaseMetricsByAttendance(scopedAttendances as any[]);

  return {
    attendanceMetrics,
    overtimePerAttendance: calculateWeeklyOvertimePerAttendance(
      scopedAttendances as any[],
      attendanceMetrics
    ),
  };
}
