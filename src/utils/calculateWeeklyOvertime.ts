import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "./calculaHoraExtra";

export function calculateWeeklyOvertime(weeklyAttendances: Map<string, { attendances: any[] }>) {
  let totalPrice = 0;
  let totalHours = 0;
  let totalRegularHours = 0;
  let totalOvertimeHours = 0;

  weeklyAttendances.forEach((weekData) => {
    let weeklyRegularHoursUsed = 0;
    const WEEKLY_REGULAR_LIMIT = 40;

    const sortedAttendances = [...(weekData.attendances || [])].sort(
      (a: any, b: any) =>
        new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime()
    );

    sortedAttendances.forEach((attendance: any) => {
      if (!attendance.check_in_time || !attendance.user) return;

      let dailyHours = 0;
      if (attendance.check_out_time) {
        const hours = calcularHorasTrabalhadas(
          attendance.check_in_time.toISOString(),
          attendance.check_out_time.toISOString(),
          attendance.workStartTime,
          attendance.workEndTime,
          attendance.user.defaultBreakMinutes || 0
        );
        dailyHours =
          convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
      }

      const hadOvertimePermission = attendance.isOvertime === true;
      const hourlyRate = attendance.user.hourly_price || 0;
      const remainingRegularHours = Math.max(
        0,
        WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed
      );
      const regularHoursThisDay = Math.min(dailyHours, remainingRegularHours);
      const potentialOvertimeHours = Math.max(
        0,
        dailyHours - regularHoursThisDay
      );

      weeklyRegularHoursUsed += regularHoursThisDay;

      if (hadOvertimePermission && potentialOvertimeHours > 0) {
        totalRegularHours += regularHoursThisDay;
        totalOvertimeHours += potentialOvertimeHours;
        totalPrice +=
          regularHoursThisDay * hourlyRate +
          potentialOvertimeHours * hourlyRate * 1.5;
      } else {
        totalRegularHours += dailyHours;
        totalPrice += dailyHours * hourlyRate;
      }

      totalHours += dailyHours;
    });
  });

  return {
    totalPrice: parseFloat(totalPrice.toFixed(2)),
    totalHours: parseFloat(totalHours.toFixed(2)),
    totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
    totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
  };
}

export type AttendanceForOvertime = {
  id: string;
  user_id: string;
  check_in_time: Date;
  check_out_time: Date | null;
  workStartTime: string | null;
  workEndTime: string | null;
  isOvertime: boolean | null;
  user: {
    hourly_price?: number | null;
    defaultBreakMinutes?: number | null;
  };
};

export function calculateWeeklyOvertimePerAttendance(
  attendances: AttendanceForOvertime[]
): Map<string, { regularHours: number; overtimeHours: number; price: number }> {
  const WEEKLY_REGULAR_LIMIT = 40;
  const byUserWeek = new Map<string, AttendanceForOvertime[]>();

  for (const a of attendances) {
    if (!a.check_in_time || !a.user) continue;
    const userId = a.user_id;
    const attendanceDate = new Date(a.check_in_time);
    const dayOfWeek = attendanceDate.getUTCDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(attendanceDate);
    monday.setUTCDate(attendanceDate.getUTCDate() + diffToMonday);
    monday.setUTCHours(0, 0, 0, 0);
    const weekKey = `${userId}-${monday.toISOString().slice(0, 10)}`;

    if (!byUserWeek.has(weekKey)) byUserWeek.set(weekKey, []);
    byUserWeek.get(weekKey)!.push(a);
  }

  const perAttendance = new Map<
    string,
    { regularHours: number; overtimeHours: number; price: number }
  >();

  byUserWeek.forEach((weekAttendances) => {
    const sorted = [...weekAttendances].sort(
      (x, y) =>
        new Date(x.check_in_time).getTime() - new Date(y.check_in_time).getTime()
    );
    let weeklyRegularHoursUsed = 0;

    sorted.forEach((attendance) => {
      let dailyHours = 0;
      if (attendance.check_out_time) {
        const hours = calcularHorasTrabalhadas(
          attendance.check_in_time.toISOString(),
          attendance.check_out_time.toISOString(),
          attendance.workStartTime,
          attendance.workEndTime,
          attendance.user?.defaultBreakMinutes ?? 0
        );
        dailyHours =
          convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
      }

      const hadOvertimePermission = attendance.isOvertime === true;
      const hourlyRate = attendance.user?.hourly_price ?? 0;
      const remainingRegularHours = Math.max(
        0,
        WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed
      );
      const regularHoursThisDay = Math.min(dailyHours, remainingRegularHours);
      const potentialOvertimeHours = Math.max(
        0,
        dailyHours - regularHoursThisDay
      );
      weeklyRegularHoursUsed += regularHoursThisDay;

      let regularHours = dailyHours;
      let overtimeHours = 0;
      let price = dailyHours * hourlyRate;

      if (hadOvertimePermission && potentialOvertimeHours > 0) {
        regularHours = regularHoursThisDay;
        overtimeHours = potentialOvertimeHours;
        price =
          regularHoursThisDay * hourlyRate +
          potentialOvertimeHours * hourlyRate * 1.5;
      }

      perAttendance.set(attendance.id, {
        regularHours: parseFloat(regularHours.toFixed(2)),
        overtimeHours: parseFloat(overtimeHours.toFixed(2)),
        price: parseFloat(price.toFixed(2)),
      });
    });
  });

  return perAttendance;
}
