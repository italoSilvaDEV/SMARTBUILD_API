import { DateTime } from "luxon";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

function calculateWeeklyOvertime(weeklyAttendances: Map<string, any>) {
    let totalPrice = 0;
    let totalHours = 0;
    let totalRegularHours = 0;
    let totalOvertimeHours = 0;

    weeklyAttendances.forEach(weekData => {
        let weeklyRegularHoursUsed = 0;
        const WEEKLY_REGULAR_LIMIT = 40;

        const sortedAttendances = weekData.attendances.sort((a: any, b: any) =>
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
                );
                dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
            }

            const hadOvertimePermission = attendance.isOvertime === true;
            const hourlyRate = attendance.user.hourly_price || 0;

            // Calcular horas regulares e overtime desta attendance
            const remainingRegularHours = Math.max(0, WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed);
            const regularHoursThisDay = Math.min(dailyHours, remainingRegularHours);
            const potentialOvertimeHours = Math.max(0, dailyHours - regularHoursThisDay);

            weeklyRegularHoursUsed += regularHoursThisDay;

            // Aplicar overtime apenas se houver permissão
            if (hadOvertimePermission && potentialOvertimeHours > 0) {
                totalRegularHours += regularHoursThisDay;
                totalOvertimeHours += potentialOvertimeHours;
                totalPrice += (regularHoursThisDay * hourlyRate) + (potentialOvertimeHours * hourlyRate * 1.5);
            } else {
                // Sem permissão de overtime: tudo vira horas regulares
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
        totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2))
    };
}

export class getByWorkerIdController {
    async handle(req: Request, res: Response) {
        const {
            companyId,
            workerId
        } = req.params

        const {
            start_date,
            deadline,
        } = req.query

        if (!companyId || !start_date || !deadline || !workerId) {
            return res.status(400).json({
                error: "Company Id, start date, deadline and worker id are required"
            });
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(404).json({
                error: "Company not found"
            });
        }

        const startDate = DateTime.fromISO(String(start_date)).startOf('day').toJSDate();
        const deadlineDate = DateTime.fromISO(String(deadline)).endOf('day').toJSDate();

        try {
            const user = await prisma.user.findUnique({
                where: {
                    id: workerId
                },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    office: true,
                    isOverTime: true
                }
            });

            if (!user) {
                return res.status(404).json({
                    error: "Worker not found"
                });
            }

            const attendances = await prisma.userAttendance.findMany({
                where: {
                    user_id: workerId,
                    check_in_time: {
                        gte: startDate,
                        lte: deadlineDate,
                    },
                    OR: [
                        {
                            check_out_time: {
                                lte: deadlineDate,
                            }
                        },
                        {
                            check_out_time: null
                        }
                    ],
                    UserServiceProject: {
                        service_project: {
                            Project: {
                                company_id: companyId,
                                status_project: {
                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                }
                            }
                        }
                    }
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            hourly_price: true,
                            isOverTime: true
                        }
                    },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                include: {
                                    Project: {
                                        include: {
                                            client: {
                                                select: {
                                                    location: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    check_in_time: 'desc'
                }
            }).then(results => results.filter(attendance =>
                attendance.check_in_time
            ));

            const weeklyAttendances = new Map();

            attendances.forEach(attendance => {
                if (attendance.check_in_time && attendance.user) {
                    const userId = attendance.user.id;
                    const attendanceDate = DateTime.fromJSDate(attendance.check_in_time);
                    const weekStart = attendanceDate.startOf('week').plus({ days: 1 });
                    const weekKey = `${userId}-${weekStart.toISODate()}`;

                    if (!weeklyAttendances.has(weekKey)) {
                        weeklyAttendances.set(weekKey, {
                            user: attendance.user,
                            attendances: []
                        });
                    }

                    weeklyAttendances.get(weekKey).attendances.push(attendance);
                }
            });

            const overtimeTotals = calculateWeeklyOvertime(weeklyAttendances);

            let avatarUrl = "";
            if (user.avatar) {
                try {
                    avatarUrl = await getPresignedUrl(user.avatar);
                } catch (error) {
                    // console.error("Erro ao gerar presigned URL para avatar:", error);
                    avatarUrl = user.avatar;
                }
            }

            const userWorker = {
                id: user.id,
                name: user.name,
                avatar: avatarUrl,
                office: user.office.name,
                isOverTime: overtimeTotals.totalOvertimeHours > 0
            };

            const workersWithCorrectOvertime: any[] = [];

            weeklyAttendances.forEach(weekData => {
                let weeklyRegularHoursUsed = 0;
                const WEEKLY_REGULAR_LIMIT = 40;

                const sortedWeekAttendances = weekData.attendances.sort((a: any, b: any) =>
                    new Date(a.check_in_time).getTime() - new Date(b.check_in_time).getTime()
                );

                sortedWeekAttendances.forEach((attendance: any) => {
                    if (!attendance.check_in_time) {
                        return;
                    }

                    let dailyHours = 0;

                    if (attendance.check_out_time) {
                        const hours = calcularHorasTrabalhadas(
                            attendance.check_in_time.toISOString(),
                            attendance.check_out_time.toISOString(),
                            attendance.workStartTime,
                            attendance.workEndTime,
                        );
                        dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                    } else {
                        dailyHours = 0;
                    }
                    const hadOvertimePermission = attendance.isOvertime === true;
                    const hourlyRate = attendance.user.hourly_price || 0;

                    const remainingRegularHours = Math.max(0, WEEKLY_REGULAR_LIMIT - weeklyRegularHoursUsed);
                    const regularHoursThisDay = Math.min(dailyHours, remainingRegularHours);
                    const potentialOvertimeHours = Math.max(0, dailyHours - regularHoursThisDay);

                    weeklyRegularHoursUsed += regularHoursThisDay;

                    let finalRegularHours = 0;
                    let finalOvertimeHours = 0;
                    let attendancePrice = 0;

                    if (hadOvertimePermission && potentialOvertimeHours > 0) {
                        finalRegularHours = regularHoursThisDay;
                        finalOvertimeHours = potentialOvertimeHours;
                        attendancePrice = (finalRegularHours * hourlyRate) + (finalOvertimeHours * hourlyRate * 1.5);
                    } else {
                        finalRegularHours = dailyHours;
                        finalOvertimeHours = 0;
                        attendancePrice = dailyHours * hourlyRate;
                    }

                    const projectLocation = attendance.UserServiceProject?.service_project?.Project?.location;
                    const clientLocation = attendance.UserServiceProject?.service_project?.Project?.client?.location;
                    const checkInAddress = projectLocation || clientLocation || "";

                    workersWithCorrectOvertime.push({
                        id: attendance.id,
                        check_in_time: attendance.check_in_time,
                        check_out_time: attendance.check_out_time,
                        check_in_address: checkInAddress,
                        check_in_latitude: attendance.check_in_latitude,
                        check_in_longitude: attendance.check_in_longitude,
                        check_out_address: attendance.check_out_address,
                        check_out_latitude: attendance.check_out_latitude,
                        check_out_longitude: attendance.check_out_longitude,
                        date: attendance.date,
                        user_id: attendance.user_id,
                        user_service_project_id: attendance.user_service_project_id,
                        isOvertime: attendance.isOvertime,
                        user: {
                            name: attendance.user.name,
                            hourly_price: attendance.user.hourly_price,
                            isOverTime: finalOvertimeHours > 0
                        },
                        hours_worked: parseFloat(dailyHours.toFixed(2)),
                        regular_hours: parseFloat(dailyHours.toFixed(2)),
                        overtime_hours: 0,
                        price: parseFloat((dailyHours * hourlyRate).toFixed(2))
                    });
                });
            });

            const workers = workersWithCorrectOvertime.sort((a, b) =>
                new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime()
            );

            const totalPages = 1;

            return res.status(200).json({
                indicators: overtimeTotals,
                userWorker,
                workers,
                totalPages
            });

        } catch (error) {
            return res.status(500).json({
                error: "Internal server error: " + error
            });
        }
    }
}