import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { DateTime } from "luxon";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";

export class getAllController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params

        const {
            start_date,
            deadline,
        } = req.query

        if (!companyId || !start_date || !deadline) {
            return res.status(400).json({
                error: "companyId is required"
            })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(404).json({
                error: "Company not found"
            })
        }

        const startDate = DateTime.fromISO(String(start_date)).startOf('day').toJSDate();
        const deadlineDate = DateTime.fromISO(String(deadline)).endOf('day').toJSDate();

        try {
            const projects = await prisma.project.findMany({
                where: {
                    company_id: companyId,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                    },
                    serviceProject: {
                        some: {
                            UserServiceProject: {
                                some: {
                                    user_attendances: {
                                        some: {
                                            check_in_time: {
                                                gte: startDate,
                                            },
                                            check_out_time: {
                                                lte: deadlineDate,
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                select: {
                    id: true,
                    location: true,
                    client: {
                        select: {
                            name: true,
                            location: true,
                            city_and_state: true,
                        }
                    },
                    serviceProject: {
                        select: {
                            id: true,
                            name: true,
                            UserServiceProject: {
                                select: {
                                    user_attendances: {
                                        where: {
                                            check_in_time: {
                                                gte: startDate,
                                            },
                                            check_out_time: {
                                                lte: deadlineDate,
                                            }
                                        },
                                        select: {
                                            date: true,
                                            check_in_time: true,
                                            check_out_time: true,
                                            workStartTime: true,
                                            workEndTime: true,
                                            isOvertime: true,
                                            user: {
                                                select: {
                                                    name: true,
                                                    hourly_price: true
                                                }
                                            }
                                        },
                                        orderBy: {
                                            check_in_time: 'desc'
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            const allAttendances = await prisma.userAttendance.findMany({
                where: {
                    check_in_time: {
                        gte: startDate,
                    },
                    check_out_time: {
                        lte: deadlineDate,
                    },
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
                select: {
                    check_in_time: true,
                    check_out_time: true,
                    workStartTime: true,
                    workEndTime: true,
                    isOvertime: true,
                    user: {
                        select: {
                            hourly_price: true
                        }
                    }
                }
            });

            let totalPrice = 0;
            let totalHours = 0;
            let totalRegularHours = 0;
            let totalOvertimeHours = 0;

            allAttendances.forEach(attendance => {
                if (attendance.check_out_time && attendance.check_in_time) {
                    const hours = calcularHorasTrabalhadas(
                        attendance.check_in_time.toISOString(),
                        attendance.check_out_time.toISOString(),
                        attendance.workStartTime,
                        attendance.workEndTime,
                    );

                    const regularHours = convertHHMMToDecimal(hours.normais);
                    const overtimeHours = convertHHMMToDecimal(hours.extras);
                    const dailyHours = regularHours + overtimeHours;

                    totalHours += dailyHours;

                    const hadOvertimePermission = attendance.isOvertime === true;
                    const hourlyRate = attendance.user?.hourly_price || 0;

                    if (hadOvertimePermission) {
                        totalRegularHours += regularHours;
                        totalOvertimeHours += overtimeHours;
                        totalPrice += (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
                    } else {
                        totalRegularHours += dailyHours;
                        totalPrice += dailyHours * hourlyRate;
                    }
                }
            });

            const totalProjects = projects.length;
            const totalServices = projects.reduce((acc, project) => acc + project.serviceProject.length, 0);

            const indicators = {
                totalPrice: parseFloat(totalPrice.toFixed(2)),
                totalHours: parseFloat(totalHours.toFixed(2)),
                totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
                totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
                totalServices,
                totalProjects
            };

            const formattedProjects = projects.map(project => {
                const clientName = project.client?.name || "";
                const clientAddress = project.location || project.client?.location || "";
                const clientData = `${clientName} - ${clientAddress}`;
                const clientCityAndState = project.client?.city_and_state || "";
                const serviceCount = project.serviceProject.length;

                const workerData: any[] = [];

                project.serviceProject.forEach(service => {
                    service.UserServiceProject.forEach(userService => {
                        userService.user_attendances.forEach(attendance => {
                            if (attendance.check_out_time && attendance.check_in_time) {
                                const hours = calcularHorasTrabalhadas(
                                    attendance.check_in_time.toISOString(),
                                    attendance.check_out_time.toISOString(),
                                    attendance.workStartTime,
                                    attendance.workEndTime,
                                );

                                const regularHours = convertHHMMToDecimal(hours.normais);
                                const overtimeHours = convertHHMMToDecimal(hours.extras);
                                const totalHours = regularHours + overtimeHours;
                                const hadOvertimePermission = attendance.isOvertime === true;
                                const hourlyRate = attendance.user?.hourly_price || 0;

                                let finalRegularHours = 0;
                                let finalOvertimeHours = 0;
                                let price = 0;

                                if (hadOvertimePermission) {
                                    finalRegularHours = regularHours;
                                    finalOvertimeHours = overtimeHours;
                                    price = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
                                } else {
                                    finalRegularHours = totalHours;
                                    finalOvertimeHours = 0;
                                    price = totalHours * hourlyRate;
                                }

                                workerData.push({
                                    nameWorker: attendance.user?.name || "",
                                    date: attendance.date,
                                    in: attendance.check_in_time,
                                    out: attendance.check_out_time,
                                    regular_hours: parseFloat(finalRegularHours.toFixed(2)),
                                    overtime_hours: parseFloat(finalOvertimeHours.toFixed(2)),
                                    total_hours: parseFloat(totalHours.toFixed(2)),
                                    price: parseFloat(price.toFixed(2))
                                });
                            }
                        });
                    });
                });

                return {
                    clientData,
                    clientName,
                    clientAddress,
                    clientCityAndState,
                    serviceCount,
                    workerData: workerData.sort((a, b) => new Date(b.in).getTime() - new Date(a.in).getTime())
                };
            });

            return res.status(200).json({
                data: {
                    indicators,
                    projects: formattedProjects,
                    workers: [],
                    payroll: []
                }
            })
        } catch (error) {
            res.status(500).json({
                error: "Internal server error" + error
            })
        }
    }
}