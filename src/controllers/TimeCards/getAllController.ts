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
                    serviceProject: {
                        select: {
                            id: true
                        }
                    }
                }
            });

            // 2. Buscar todas as attendances do período com dados necessários
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
                    isOvertime: true, // Campo histórico do momento do ponto
                    user: {
                        select: {
                            hourly_price: true
                        }
                    }
                }
            });

            // 3. Calcular métricas dos indicators
            let totalPrice = 0;
            let totalHours = 0;
            let totalRegularHours = 0;
            let totalOvertimeHours = 0;

            allAttendances.forEach(attendance => {
                if (attendance.check_out_time && attendance.check_in_time) {
                    // Calcular horas trabalhadas
                    const hours = calcularHorasTrabalhadas(
                        attendance.check_in_time.toISOString(),
                        attendance.check_out_time.toISOString(),
                        attendance.workStartTime,
                        attendance.workEndTime,
                    );

                    const regularHours = convertHHMMToDecimal(hours.normais);
                    const overtimeHours = convertHHMMToDecimal(hours.extras);
                    const dailyHours = regularHours + overtimeHours;

                    // Somar às métricas totais
                    totalHours += dailyHours;

                    // Verificar isOvertime histórico do momento do ponto
                    const hadOvertimePermission = attendance.isOvertime === true;
                    const hourlyRate = attendance.user?.hourly_price || 0;

                    if (hadOvertimePermission) {
                        // Tinha permissão de overtime: calcular regular + overtime
                        totalRegularHours += regularHours;
                        totalOvertimeHours += overtimeHours;
                        totalPrice += (regularHours * hourlyRate) + (overtimeHours * hourlyRate * 1.5);
                    } else {
                        // NÃO tinha permissão: todas as horas como regulares
                        totalRegularHours += dailyHours;
                        totalPrice += dailyHours * hourlyRate;
                    }
                }
            });

            // 4. Contar projetos e serviços
            const totalProjects = projects.length;
            const totalServices = projects.reduce((acc, project) => acc + project.serviceProject.length, 0);

            // 5. Montar objeto indicators
            const indicators = {
                totalPrice: parseFloat(totalPrice.toFixed(2)),
                totalHours: parseFloat(totalHours.toFixed(2)),
                totalRegularHours: parseFloat(totalRegularHours.toFixed(2)),
                totalOvertimeHours: parseFloat(totalOvertimeHours.toFixed(2)),
                totalServices,
                totalProjects
            };

            return res.status(200).json({
                data: {
                    indicators,
                    projects: [], // TODO: implementar próximo
                    workers: [], // TODO: implementar próximo  
                    payroll: [] // TODO: implementar próximo
                }
            })
        } catch (error) {
            res.status(500).json({
                error: "Internal server error" + error
            })
        }
    }
}