import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import dayjs from "dayjs";

export class FindWorkedHoursProjectController {
    async handle(request: Request, response: Response) {
        try {
            const { project_id, name_user, pag, date_initial, date_final } = request.body;

            if (!project_id) {
                return response.status(400).json({ error: "Project ID is required" });
            }

            const filtro: any = { project_id };

            if (name_user) {
                filtro.name_user = { contains: name_user };
            }
            const dateStart = new Date(date_initial);
            dateStart.setUTCHours(0, 0, 0, 0);
            const dateEnd = new Date(date_final);
            dateEnd.setUTCHours(23, 59, 59, 999);
            if (date_initial && date_final) {
                filtro.start_date = {
                    gte: dateStart.toISOString(),
                    lte: dateEnd.toISOString(),
                };
            } else if (date_initial) {
                filtro.start_date = {
                    gte: dateStart.toISOString(),
                    lte: dateEnd.toISOString(),
                };
            } else if (date_final) {
                filtro.start_date = {
                    lte: dateEnd.toISOString(),
                };
            }

            const pageNumber = Number(pag) || 0;

            const result = await prisma.workedhours.findMany({
                where: filtro,
                select: {
                    id: true,
                    project_id: true,
                    name_user: true,
                    amount_of_hours: true,
                    hourly_price: true,
                    date_creation: true,
                    start_date: true,
                    end_date: true
                },
                skip: pageNumber * 20,
                take: 20,
                orderBy: {
                    date_creation: "desc"
                },
            });


            const resultAttendance = await prisma.userAttendance.findMany({
                where: {
                    AND: [
                        {
                            UserServiceProject: {
                                service_project: {
                                    projectId: {
                                        equals: project_id
                                    }
                                }
                            },
                        },
                        
                    ]
                   
                    
                },
                include: {
                    UserServiceProject: {
                        select: {
                            service_project: {
                                select: {
                                    price: true,
                                }
                            }
                        }
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                            hourly_price: true
                        }
                    }
                },
                orderBy: {
                    check_in_time: "desc"
                }
            });

            // Calcular as horas trabalhadas
            const formattedResult = resultAttendance.map((attendance) => {
                let hoursWorked = 0;
                if (attendance.check_out_time) {
                    hoursWorked = dayjs(attendance.check_out_time).diff(dayjs(attendance.check_in_time), 'hour', true);
                }
                return {
                    id: '',
                    project_id: '',
                    name_user: attendance.user.name,
                    amount_of_hours: String(attendance.user.hourly_price),
                    hourly_price: String(Number(attendance.user.hourly_price) * parseFloat(hoursWorked.toFixed(2))),
                    data_creation: attendance.check_in_time,
                    start_date: attendance.check_in_time,
                    end_date: attendance.check_out_time
                };
            });

            const total = await prisma.workedhours.count({
                where: filtro
            });

            // Combinar os resultados de workedhours e userAttendance
            const combinedResults = [...result, ...formattedResult];
            return response.json({ total, result: combinedResults });
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal server error" });
        }
    }
}
