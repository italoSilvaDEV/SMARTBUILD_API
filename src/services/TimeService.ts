import { DateTime } from "luxon";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../utils/calculaHoraExtra";

export interface AttendanceWithUser {
    check_in_time: Date | null;
    check_out_time: Date | null;
    workStartTime: string | null;
    workEndTime: string | null;
    date: Date;
    user: {
        id: string;
        name: string;
        hourly_price: number | null;
        isOverTime: boolean | null;
        defaultBreakMinutes: number | null;
        dailyRate: any | null;
    };
    isOvertime?: boolean | null;
}

export class TimeService {
    /**
     * Calcula as horas e preços para uma lista de registros de presença.
     * Agrupa por semana e aplica regras de overtime (40h).
     */
    calculatePeriodTotals(attendances: AttendanceWithUser[]) {
        const attendancesByUser = this.groupByUser(attendances);
        const allFormatted: any[] = [];

        Object.values(attendancesByUser).forEach(userAttendances => {
            const attendancesByWeek = this.groupByWeek(userAttendances);

            Object.values(attendancesByWeek).forEach(weekAttendances => {
                const weekResults = this.processWeekAttendances(weekAttendances);
                allFormatted.push(...weekResults);
            });
        });

        return allFormatted;
    }

    private groupByUser(attendances: AttendanceWithUser[]) {
        return attendances.reduce((acc, curr) => {
            const userId = curr.user.id;
            if (!acc[userId]) acc[userId] = [];
            acc[userId].push(curr);
            return acc;
        }, {} as Record<string, AttendanceWithUser[]>);
    }

    private groupByWeek(attendances: AttendanceWithUser[]) {
        return attendances.reduce((acc, curr) => {
            if (!curr.check_in_time) return acc;
            const weekKey = this.getWeekKey(curr.date);
            if (!acc[weekKey]) acc[weekKey] = [];
            acc[weekKey].push(curr);
            return acc;
        }, {} as Record<string, AttendanceWithUser[]>);
    }

    private getWeekKey(date: Date): string {
        const dateTime = DateTime.fromJSDate(date);
        const startOfWeek = dateTime.weekday === 7 ? dateTime.startOf('day') : dateTime.minus({ days: dateTime.weekday }).startOf('day');
        return startOfWeek.toFormat('yyyy-MM-dd');
    }

    private processWeekAttendances(weekAttendances: AttendanceWithUser[]) {
        let totalWeekHours = 0;
        const user = weekAttendances[0].user;
        const dailyRate = user.dailyRate ? Number(user.dailyRate) : 0;
        const sortedWeekAttendances = [...weekAttendances].sort((a, b) => {
            const aTime = a.check_in_time?.getTime() ?? a.date.getTime();
            const bTime = b.check_in_time?.getTime() ?? b.date.getTime();
            return aTime - bTime;
        });

        // 1. Calcular horas diárias
        const withDailyHours = sortedWeekAttendances.map(att => {
            if (!att.check_in_time || !att.check_out_time) {
                return {
                    ...att,
                    dailyHours: 0,
                    rawDailyHours: 0,
                    breakMinutesApplied: 0,
                    breakHoursApplied: 0
                };
            }

            const breakMinutes = user.defaultBreakMinutes || 0;
            const grossHours = calcularHorasTrabalhadas(
                att.check_in_time.toISOString(),
                att.check_out_time.toISOString(),
                att.workStartTime,
                att.workEndTime,
                0
            );
            const grossDailyHours = convertHHMMToDecimal(grossHours.normais) + convertHHMMToDecimal(grossHours.extras);

            const hours = calcularHorasTrabalhadas(
                att.check_in_time.toISOString(),
                att.check_out_time.toISOString(),
                att.workStartTime,
                att.workEndTime,
                breakMinutes
            );
            const dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
            const breakMinutesApplied = Math.min(breakMinutes, Math.round(grossDailyHours * 60));
            totalWeekHours += dailyHours;
            return {
                ...att,
                dailyHours,
                rawDailyHours: grossDailyHours,
                breakMinutesApplied,
                breakHoursApplied: breakMinutesApplied / 60
            };
        });

        // 2. Aplicar overtime em ordem cronologica.
        // O excesso semanal so vira overtime se o proprio attendance estiver marcado como overtime.
        let weeklyRegularHoursUsed = 0;
        return withDailyHours.map(att => {
            let regBase = 0;
            let overBase = 0;

            if (totalWeekHours > 40) {
                const remainingReg = Math.max(0, 40 - weeklyRegularHoursUsed);
                regBase = Math.min(att.dailyHours, remainingReg);
                overBase = Math.max(0, att.dailyHours - regBase);
                weeklyRegularHoursUsed += regBase;
            } else {
                regBase = att.dailyHours;
                overBase = 0;
            }

            const overtimeAllowed = att.isOvertime === true;
            const reg = overtimeAllowed ? regBase : att.dailyHours;
            const over = overtimeAllowed ? overBase : 0;

            let price = 0;
            if (dailyRate > 0) {
                const attendedDays = withDailyHours.filter(item => item.dailyHours > 0).length;
                price = attendedDays > 0 && att.dailyHours > 0 ? dailyRate : 0;
            } else {
                const hourlyRate = user.hourly_price || 0;
                price = (reg * hourlyRate) + (over * hourlyRate * 1.5);
            }

            return {
                ...att,
                hours_worked: parseFloat(att.dailyHours.toFixed(2)),
                raw_hours_worked: parseFloat((att.rawDailyHours || 0).toFixed(2)),
                break_minutes: att.breakMinutesApplied || 0,
                break_hours: parseFloat((att.breakHoursApplied || 0).toFixed(2)),
                regular_hours: parseFloat(reg.toFixed(2)),
                overtime_hours: parseFloat(over.toFixed(2)),
                price: parseFloat(price.toFixed(2))
            };
        });
    }
}
