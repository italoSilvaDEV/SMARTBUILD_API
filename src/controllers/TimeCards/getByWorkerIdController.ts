import { DateTime } from "luxon";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

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
                    date: {
                        gte: startDate,
                        lte: deadlineDate
                    }
                },
                include: {
                    user: {
                        select: {
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
                attendance.check_in_time && attendance.check_out_time
            ));

            let totalPrice = 0;
            let totalHours = 0;
            let totalRegularHours = 0;
            let totalOvertimeHours = 0;

            attendances.forEach(attendance => {
                if (attendance.check_out_time && attendance.check_in_time) {
                    const hours = calcularHorasTrabalhadas(
                        attendance.check_in_time.toISOString(),
                        attendance.check_out_time.toISOString(),
                        attendance.workStartTime,
                        attendance.workEndTime,
                    );

                    const regularHours = convertHHMMToDecimal(hours.normais);
                    const overtimeHours = convertHHMMToDecimal(hours.extras);
                    const hoursWorked = regularHours + overtimeHours;
                    const hadOvertimePermission = attendance.isOvertime === true;
                    const hourlyRate = attendance.user.hourly_price || 0;

                    let finalRegularHours = 0;
                    let finalOvertimeHours = 0;
                    let attendancePrice = 0;

                    if (hadOvertimePermission) {
                        finalRegularHours = regularHours;
                        finalOvertimeHours = overtimeHours;
                        attendancePrice = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
                    } else {
                        finalRegularHours = hoursWorked;
                        finalOvertimeHours = 0;
                        attendancePrice = hoursWorked * hourlyRate;
                    }

                    totalHours += hoursWorked;
                    totalRegularHours += finalRegularHours;
                    totalOvertimeHours += finalOvertimeHours;
                    totalPrice += attendancePrice;
                }
            });

            let avatarUrl = "";
            if (user.avatar) {
                try {
                    avatarUrl = await getPresignedUrl(user.avatar);
                } catch (error) {
                    console.error("Erro ao gerar presigned URL para avatar:", error);
                    avatarUrl = user.avatar;
                }
            }

            const userWorker = {
                id: user.id,
                name: user.name,
                avatar: avatarUrl,
                office: user.office.name,
                isOverTime: user.isOverTime
            };

            const workers = attendances.map(attendance => {
                if (!attendance.check_out_time || !attendance.check_in_time) {
                    return null;
                }

                const hours = calcularHorasTrabalhadas(
                    attendance.check_in_time.toISOString(),
                    attendance.check_out_time.toISOString(),
                    attendance.workStartTime,
                    attendance.workEndTime,
                );

                const regularHours = convertHHMMToDecimal(hours.normais);
                const overtimeHours = convertHHMMToDecimal(hours.extras);
                const hoursWorked = regularHours + overtimeHours;
                const hadOvertimePermission = attendance.isOvertime === true;
                const hourlyRate = attendance.user.hourly_price || 0;

                let finalRegularHours = 0;
                let finalOvertimeHours = 0;
                let attendancePrice = 0;

                if (hadOvertimePermission) {
                    finalRegularHours = regularHours;
                    finalOvertimeHours = overtimeHours;
                    attendancePrice = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
                } else {
                    finalRegularHours = hoursWorked;
                    finalOvertimeHours = 0;
                    attendancePrice = hoursWorked * hourlyRate;
                }

                const projectLocation = attendance.UserServiceProject?.service_project?.Project?.location;
                const clientLocation = attendance.UserServiceProject?.service_project?.Project?.client?.location;
                const checkInAddress = projectLocation || clientLocation || "";

                return {
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
                        isOverTime: attendance.user.isOverTime
                    },
                    hours_worked: parseFloat(hoursWorked.toFixed(2)),
                    regular_hours: parseFloat(finalRegularHours.toFixed(2)),
                    overtime_hours: parseFloat(finalOvertimeHours.toFixed(2)),
                    price: parseFloat(attendancePrice.toFixed(2))
                };
            }).filter(worker => worker !== null);

            const totalPages = 1;

            return res.status(200).json({
                indicators: {
                    totalPrice: parseFloat(totalPrice.toFixed(2)),
                    totalHours: parseFloat(totalHours.toFixed(2)),
                    totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
                    totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2))
                },
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