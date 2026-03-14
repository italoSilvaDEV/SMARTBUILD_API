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
        const userHasOvertime = user.isOverTime;
        const dailyRate = user.dailyRate ? Number(user.dailyRate) : 0;

        // 1. Calcular horas diárias
        const withDailyHours = weekAttendances.map(att => {
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

        // 2. Calcular Preço Semanal
        let weeklyPrice = 0;
        if (dailyRate > 0) {
            weeklyPrice = weekAttendances.length * dailyRate;
        } else {
            const hourlyRate = user.hourly_price || 0;
            if (userHasOvertime && totalWeekHours > 40) {
                weeklyPrice = (40 * hourlyRate) + ((totalWeekHours - 40) * hourlyRate * 1.5);
            } else {
                weeklyPrice = totalWeekHours * hourlyRate;
            }
        }

        // 3. Distribuir proporcionalmente por dia
        let weeklyRegularHoursUsed = 0;
        return withDailyHours.map(att => {
            const proportionalPrice = totalWeekHours > 0 ? (att.dailyHours / totalWeekHours) * weeklyPrice : 0;
            
            let reg = 0;
            let over = 0;

            if (userHasOvertime && totalWeekHours > 40) {
                const remainingReg = Math.max(0, 40 - weeklyRegularHoursUsed);
                reg = Math.min(att.dailyHours, remainingReg);
                over = Math.max(0, att.dailyHours - reg);
                weeklyRegularHoursUsed += reg;
            } else {
                reg = att.dailyHours;
                over = 0;
            }

            return {
                ...att,
                hours_worked: parseFloat(att.dailyHours.toFixed(2)),
                raw_hours_worked: parseFloat((att.rawDailyHours || 0).toFixed(2)),
                break_minutes: att.breakMinutesApplied || 0,
                break_hours: parseFloat((att.breakHoursApplied || 0).toFixed(2)),
                regular_hours: parseFloat(reg.toFixed(2)),
                overtime_hours: parseFloat(over.toFixed(2)),
                price: parseFloat(proportionalPrice.toFixed(2))
            };
        });
    }
}
