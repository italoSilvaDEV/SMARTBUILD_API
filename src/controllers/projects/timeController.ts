import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { TimeService } from "../../services/TimeService";

const timeService = new TimeService();

export class TimeController {
    async findMany(req: Request, res: Response) {
        const page = Number(req.query.page) || 0;
        const { id, search, start_date, deadline } = req.query;

        try {
            if (!id || !start_date || !deadline) {
                return res.status(400).json({ error: "Params invalid" });
            }

            const startDate = new Date(String(start_date));
            const endDeadline = new Date(String(deadline));

            const allAttendances = await prisma.userAttendance.findMany({
                where: {
                    AND: [
                        search ? { user: { name: { contains: String(search) } } } : {},
                        { check_in_time: { gte: startDate } },
                        { OR: [{ check_out_time: { lte: endDeadline } }, { check_out_time: null }] },
                        {
                            UserServiceProject: {
                                service_project: {
                                    Project: {
                                        company_id: String(id),
                                        status_project: { in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"] }
                                    }
                                }
                            }
                        }
                    ]
                },
                include: {
                    user: {
                        select: {
                            id: true, name: true, hourly_price: true, isOverTime: true,
                            defaultBreakMinutes: true, dailyRate: true
                        }
                    },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                include: {
                                    Project: {
                                        include: { client: true }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: { check_in_time: 'desc' }
            });

            const processed = timeService.calculatePeriodTotals(allAttendances as any);
            const indicators = this.calculateIndicators(processed);
            const consolidated = this.consolidateByWorker(processed);
            
            const pageSize = 10;
            const paginatedWorkers = consolidated
                .sort((a, b) => a.user.name.localeCompare(b.user.name))
                .slice(page * pageSize, (page + 1) * pageSize);

            return res.json({
                indicators,
                workers: paginatedWorkers,
                totalPages: Math.ceil(consolidated.length / pageSize),
                projects: this.groupByProject(processed)
            });

        } catch (error: any) {
            console.error("Error in TimeController.findMany:", error);
            return res.status(500).json({ error: error.message || "Internal server error" });
        }
    }

    async findManyByIdWorker(req: Request, res: Response) {
        const { worker_id, start_date, deadline, page } = req.query;
        const pageNumber = Number(page) || 0;

        try {
            if (!worker_id || !start_date || !deadline) {
                return res.status(400).json({ error: "Params invalid" });
            }

            const startDate = new Date(String(start_date));
            const endDeadline = new Date(String(deadline));

            const attendances = await prisma.userAttendance.findMany({
                where: {
                    user_id: String(worker_id),
                    check_in_time: { gte: startDate, lte: endDeadline },
                    UserServiceProject: {
                        service_project: {
                            Project: {
                                status_project: { in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"] }
                            }
                        }
                    }
                },
                include: {
                    user: true,
                    UserServiceProject: {
                        include: {
                            service_project: {
                                include: {
                                    Project: { include: { client: true } }
                                }
                            }
                        }
                    }
                },
                orderBy: { check_in_time: 'desc' }
            });

            const processed = timeService.calculatePeriodTotals(attendances as any);
            const indicators = this.calculateIndicators(processed);
            const user = attendances[0]?.user;
            const urlAvatar = user?.avatar ? await getPresignedUrl(String(user.avatar)) : null;

            return res.json({
                indicators,
                userWorker: {
                    id: user?.id,
                    name: user?.name,
                    avatar: urlAvatar,
                },
                workers: processed.slice(pageNumber * 10, (pageNumber + 1) * 10),
                totalPages: Math.ceil(processed.length / 10)
            });

        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    async findManyByIdWorkerWeb(req: Request, res: Response) {
        return this.findManyByIdWorker(req, res); // Reutiliza lógica para Web
    }

    async findManyActivies(req: Request, res: Response) {
        const { id, start_date, deadline, page } = req.query;
        const pageNumber = Number(page) || 0;

        try {
            if (!id || !start_date || !deadline) return res.status(400).json({ error: "Params invalid" });

            const startDate = new Date(String(start_date));
            const endDeadline = new Date(String(deadline));

            // Buscar:
            // 1) Attendances com check_in hoje (normais)
            // 2) Attendances ATIVAS (check_out_time IS NULL) mesmo se check_in foi antes de hoje
            //    Isso garante que trabalhadores "overnight" ou que esqueceram de dar clock-out apareçam
            const attendances = await prisma.userAttendance.findMany({
                where: {
                    OR: [
                        // Caso 1: check-in hoje (com ou sem check-out)
                        {
                            check_in_time: { gte: startDate },
                            OR: [{ check_out_time: { lte: endDeadline } }, { check_out_time: null }],
                        },
                        // Caso 2: ainda ativo (sem check-out), independente da data de check-in
                        {
                            check_out_time: null,
                        },
                    ],
                    UserServiceProject: {
                        service_project: {
                            Project: {
                                company_id: String(id),
                                status_project: { in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"] }
                            }
                        }
                    }
                },
                include: {
                    user: { select: { id: true, name: true } },
                    UserServiceProject: {
                        include: {
                            service_project: {
                                include: {
                                    Project: { include: { client: true } }
                                }
                            }
                        }
                    }
                },
                orderBy: { check_in_time: 'desc' }
            });

            // Agrupar apenas a última atividade por usuário
            const latestByWorker: Record<string, any> = {};
            attendances.forEach(att => {
                if (!latestByWorker[att.user_id] || new Date(att.check_in_time) > new Date(latestByWorker[att.user_id].check_in_time)) {
                    latestByWorker[att.user_id] = {
                        name: att.user.name,
                        serviceName: att.UserServiceProject?.service_project?.name,
                        address: att.check_in_address,
                        status: att.check_out_time ? 'Out' : 'In',
                        check_in_time: att.check_in_time,
                        user_service_project_id: att.user_service_project_id,
                        check_out_time: att.check_out_time,
                        client: {
                            clientName: att.UserServiceProject?.service_project?.Project?.client?.name,
                            clientAddress: att.UserServiceProject?.service_project?.Project?.location
                        }
                    };
                }
            });

            const workers = Object.values(latestByWorker);
            const pageSize = 10;

            return res.json({
                indicators: {
                    totalIn: workers.filter(w => w.status === 'In').length,
                    totalOut: workers.filter(w => w.status === 'Out').length,
                    totalServices: new Set(attendances.map(a => a.user_service_project_id)).size,
                    totalProjects: new Set(attendances.map(a => a.UserServiceProject?.service_project?.Project?.id)).size
                },
                workers: workers.slice(pageNumber * pageSize, (pageNumber + 1) * pageSize),
                totalPages: Math.ceil(workers.length / pageSize)
            });
        } catch (error: any) {
            return res.status(500).json({ error: error.message });
        }
    }

    private calculateIndicators(processed: any[]) {
        return processed.reduce((acc, curr) => {
            acc.totalPrice += curr.price || 0;
            acc.totalHours += curr.hours_worked || 0;
            acc.totalRegularHours += curr.regular_hours || 0;
            acc.totalOvertimeHours += curr.overtime_hours || 0;
            return acc;
        }, { totalPrice: 0, totalHours: 0, totalRegularHours: 0, totalOvertimeHours: 0, totalServices: new Set(processed.map(p => p.user_service_project_id)).size, totalProjects: new Set(processed.map(p => p.UserServiceProject?.service_project?.Project?.id)).size });
    }

    private consolidateByWorker(processed: any[]) {
        const workers: Record<string, any> = {};
        processed.forEach(p => {
            const id = p.user.id;
            if (!workers[id]) {
                workers[id] = { user: p.user, hours_worked: 0, regular_hours: 0, overtime_hours: 0, price: 0 };
            }
            workers[id].hours_worked += p.hours_worked;
            workers[id].regular_hours += p.regular_hours;
            workers[id].overtime_hours += p.overtime_hours;
            workers[id].price += p.price;
        });
        return Object.values(workers).map(w => ({
            ...w,
            hours_worked: parseFloat(w.hours_worked.toFixed(2)),
            regular_hours: parseFloat(w.regular_hours.toFixed(2)),
            overtime_hours: parseFloat(w.overtime_hours.toFixed(2)),
            price: parseFloat(w.price.toFixed(2))
        }));
    }

    private groupByProject(processed: any[]) {
        const projects: Record<string, any> = {};
        processed.forEach(p => {
            const proj = p.UserServiceProject?.service_project?.Project;
            if (!proj) return;
            if (!projects[proj.id]) {
                projects[proj.id] = {
                    clientName: proj.client?.name,
                    clientAddress: proj.location,
                    workerData: []
                };
            }
            projects[proj.id].workerData.push({
                nameWorker: p.user.name,
                date: p.date,
                in: p.check_in_time,
                out: p.check_out_time,
                total_hours: p.hours_worked,
                regular_hours: p.regular_hours,
                overtime_hours: p.overtime_hours,
                price: p.price
            });
        });
        return Object.values(projects);
    }
}
