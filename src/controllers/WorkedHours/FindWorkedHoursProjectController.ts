import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import dayjs from "dayjs";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";

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
                    fixed_price: true,
                    type_price: true,
                    subcontractor_id: true,
                    date_creation: true,
                    start_date: true,
                    end_date: true,
                    subcontractor: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        }
                    }
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
                        date_initial && date_final ? {
                            AND: [{
                                check_in_time: {
                                    gte: dateStart.toISOString(),
                                }
                            },
                            {
                                check_out_time: {
                                    lte: dateEnd.toISOString(),
                                }
                            }]
                        } : {
                            
                        }
                       
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
                    amount_of_hours: String(parseFloat(hoursWorked.toFixed(2))) ,
                    hourly_price:  String(attendance.user.hourly_price),
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
    async handleGet(request: Request, response: Response) {
        try {
            const { project_id, name_user, date_initial, date_final } = request.body;

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

            const result = await prisma.workedhours.findMany({
                where: filtro,
                select: {
                    id: true,
                    project_id: true,
                    name_user: true,
                    amount_of_hours: true,
                    hourly_price: true,
                    fixed_price: true,
                    type_price: true,
                    subcontractor_id: true,
                    date_creation: true,
                    start_date: true,
                    end_date: true,
                    description: true,
                    payment_date: true,
                    subcontractor: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            phone: true,
                        }
                    }
                },
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
                        date_initial && date_final ? {
                            AND: [{
                                check_in_time: {
                                    gte: dateStart.toISOString(),
                                }
                            },
                            {
                                check_out_time: {
                                    lte: dateEnd.toISOString(),
                                }
                            }]
                        } : {

                        }

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
            const formattedResult = result.map((workedHours) => {
                let price = null;
                if (workedHours.type_price === "fixed") {
                    price = workedHours.fixed_price ? Number(workedHours.fixed_price) : null;
                } else {
                    price = workedHours.amount_of_hours && workedHours.hourly_price ? Number(workedHours.amount_of_hours) * Number(workedHours.hourly_price) : null;
                }
                return {
                    ...workedHours,
                    overtime_hours: null,
                    price
                }
            })
            // Calcular as horas trabalhadas
            const formattedAttendance = resultAttendance.map((attendance) => {
                
                let regularHours = 0;
                let overtimeHours = 0;

                if (attendance.check_out_time && attendance.check_in_time) {
                    const hours = calcularHorasTrabalhadas(
                        attendance.check_in_time.toISOString(),
                        attendance.check_out_time.toISOString(),
                        attendance.workStartTime,
                        attendance.workEndTime,
                    );
                    regularHours = convertHHMMToDecimal(hours.normais);
                    overtimeHours = convertHHMMToDecimal(hours.extras);
                }
                return {
                    id: '',
                    project_id: '',
                    name_user: attendance.user.name,
                    hourly_price: String(attendance.user.hourly_price),
                    amount_of_hours: regularHours,
                    overtime_hours: overtimeHours ? overtimeHours : null,
                    price:
                        (regularHours * (attendance.user.hourly_price || 0)) +
                        (overtimeHours * (attendance.user.hourly_price || 0) * 1.5),
                    data_creation: attendance.check_in_time,
                    start_date: attendance.check_in_time,
                    end_date: attendance.check_out_time
                };
            });


            // Combinar os resultados de workedhours e userAttendance
            const combinedResults = [...formattedResult, ...formattedAttendance];
            return response.json({ result: combinedResults });
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal server error" });
        }
    }
}
