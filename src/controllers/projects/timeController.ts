import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import dayjs from "dayjs";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class TimeController {
    async findMany(req: Request, res: Response) {
        const { id, search, start_date, deadline, page } = req.query;
        try {
            // Verificar se os parâmetros obrigatórios estão presentes
            if (!id || !start_date || !deadline || !page) {
                return res.status(400).json({ error: "Params invalid" });
            }

            // Verificar se a empresa existe
            const existCompany = await prisma.company.findUnique({
                where: { id: String(id) },
            });

            if (!existCompany) {
                return res.status(404).json({ error: "Company not found" });
            }

            let totalPrice = 0;
            let totalHours = 0;

            // Buscar dados de presenças de usuários
            const result = await prisma.userAttendance.findMany({
                where: {
                    AND: [
                        search ? {
                            user: {
                                name: {
                                    contains: String(search), // Se search for fornecido, filtra pelos nomes dos usuários
                                }
                            },
                        } : {},
                        {
                            date: {
                                gte: new Date(String(start_date)), // Converter para formato Date
                                lte: new Date(String(deadline)),
                            },
                        },
                        {
                            company_id: { equals: String(id) },
                        },
                    ],
                },
                include: {
                    UserServiceProject: {
                        select: {
                            service_project: {
                                select: {
                                    price: true,
                                    Project: {
                                        select: {
                                            client: {
                                                select: {
                                                    name: true
                                                }
                                            }
                                        }
                                    }
                                },
                            },
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                            hourly_price: true,
                        },
                    },

                },
                orderBy: {
                    check_in_time: "desc"
                },
                skip: Number(page) * 10,
                take: 10,
            });
            const resultCount = await prisma.userAttendance.count({
                where: {
                    AND: [
                        search ? {
                            user: {
                                name: {
                                    contains: String(search), // Se search for fornecido, filtra pelos nomes dos usuários
                                }
                            },
                        } : {},
                        {
                            date: {
                                gte: new Date(String(start_date)), // Converter para formato Date
                                lte: new Date(String(deadline)),
                            },
                        },
                        {
                            company_id: { equals: String(id) },
                        },
                    ],
                },
            })
            // Formatar e calcular horas trabalhadas
            const formattedResult = result.map((attendance) => {
                let hoursWorked = 0;

                if (attendance.check_out_time && attendance.check_in_time) {
                    hoursWorked = dayjs(attendance.check_out_time).diff(
                        dayjs(attendance.check_in_time),
                        "hour",
                        true
                    );
                }

                const roundedHours = parseFloat(hoursWorked.toFixed(2));
                const calculatedPrice = attendance.user.hourly_price
                    ? attendance.user.hourly_price * roundedHours
                    : 0;

                totalPrice += calculatedPrice;
                totalHours += roundedHours;

                return {
                    ...attendance,
                    hours_worked: roundedHours,
                    price: calculatedPrice,
                };
            });

            // Contar serviços dentro do período
            const serviceCount = await prisma.serviceProject.count({
                where: {
                    AND: [
                        {
                            UserServiceProject: {
                                some: {
                                    user_attendances: {
                                        some: {
                                            AND: [
                                                search ? {
                                                    user: {
                                                        name: {
                                                            contains: String(search), // Se search for fornecido, filtra pelos nomes dos usuários
                                                        }
                                                    },
                                                } : {},
                                                {
                                                    date: {
                                                        gte: new Date(String(start_date)), // Converter para formato Date
                                                        lte: new Date(String(deadline)),
                                                    },

                                                }
                                            ]
                                        }
                                    }
                                }
                            }

                        },
                        {
                            company_id: String(id),
                        },
                    ],
                },
            });
            // Contar projetos com status específicos dentro do período
            const projects = await prisma.project.findMany({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                            },
                        },

                        {
                            company_id: String(id),
                        },
                        {
                            serviceProject: {
                                some: {
                                    UserServiceProject: {
                                        some: {
                                            user_attendances: {
                                                some: {
                                                    AND: [
                                                        search ? {
                                                            user: {
                                                                name: {
                                                                    contains: String(search), // Se search for fornecido, filtra pelos nomes dos usuários
                                                                }
                                                            },
                                                        } : {},
                                                        {
                                                            date: {
                                                                gte: new Date(String(start_date)), // Converter para formato Date
                                                                lte: new Date(String(deadline)),
                                                            },

                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ],
                },
                include: {
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
                            UserServiceProject: {
                                select: {
                                    user_attendances: {
                                        include: {
                                            user: {
                                                select: {
                                                    name: true,
                                                    hourly_price: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                    }
                }
            });
            const projectFormatted = projects.map(i => ({
                clientData: i.client?.name + ' - ' + i.client?.location,
                serviceCount: i.serviceProject.length,
                workerData: i.serviceProject
                    .filter(s => s.UserServiceProject.length > 0) // Filtra para garantir que há dados em UserServiceProject
                    .flatMap(s => s.UserServiceProject
                        .filter(user => user.user_attendances.length > 0) // Filtra para garantir que há dados em user_attendances
                        .flatMap(user => user.user_attendances
                            .map(x => {
                                let hoursWorked = 0;
                                if (x.check_out_time && x.check_in_time) {
                                    hoursWorked = dayjs(x.check_out_time).diff(
                                        dayjs(x.check_in_time),
                                        "hour",
                                        true
                                    );
                                }

                                const roundedHours = parseFloat(hoursWorked.toFixed(2));
                                const calculatedPrice = x.user.hourly_price
                                    ? x.user.hourly_price * roundedHours
                                    : 0;
                                return ({
                                    nameWorker: x.user.name,
                                    date: x.date,
                                    in: x.check_in_time,
                                    out: x.check_out_time,
                                    price: calculatedPrice
                                })
                            })
                        )
                    )
            }));            

            // Retornar os indicadores e a lista de trabalhadores formatada
            return res.json(
                {
                    indicators: {
                        totalPrice: parseFloat(totalPrice.toFixed(2)),
                        totalHours: parseFloat(totalHours.toFixed(2)),
                        totalServices: serviceCount,
                        totalProjects: projects.length,
                    },
                    projects: projectFormatted,
                    workers: formattedResult,
                    totalPages: Math.ceil(resultCount / 10)
                }
            );
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
    async findManyByIdWorker(req: Request, res: Response) {
        const { id, worker_id, start_date, deadline, page } = req.query;
        try {
            // Verificar se os parâmetros obrigatórios estão presentes
            if (!id || !worker_id || !start_date || !deadline || !page) {
                return res.status(400).json({ error: "Params invalid" });
            }

            // Verificar se a empresa existe
            const existCompany = await prisma.company.findUnique({
                where: { id: String(id) },
            });

            if (!existCompany) {
                return res.status(404).json({ error: "Company not found" });
            }

            let totalPrice = 0;
            let totalHours = 0;
            // Verificar se a empresa existe
            const existWorker = await prisma.user.findUnique({
                where: { id: String(worker_id) }, include: { office: true }
            });
            // Buscar dados de presenças de usuários
            const result = await prisma.userAttendance.findMany({
                where: {
                    AND: [
                        {
                            date: {
                                gte: new Date(String(start_date)), // Converter para formato Date
                                lte: new Date(String(deadline)),
                            },
                        },
                        {
                            company_id: { equals: String(id) },
                        },
                        {
                            user_id: { equals: String(worker_id) }
                        }
                    ],
                },
                include: {
                    UserServiceProject: {
                        select: {
                            service_project: {
                                select: {
                                    price: true,
                                },
                            },
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                            hourly_price: true,
                        },
                    },
                },
                orderBy: {
                    check_in_time: "desc"
                },
                skip: Number(page) * 10,
                take: 10,
            });
            const resultCount = await prisma.userAttendance.count({
                where: {
                    AND: [
                        {
                            date: {
                                gte: new Date(String(start_date)), // Converter para formato Date
                                lte: new Date(String(deadline)),
                            },
                        },
                        {
                            company_id: { equals: String(id) },
                        },
                        {
                            user_id: { equals: String(worker_id) }
                        }
                    ],
                },
            })
            // Formatar e calcular horas trabalhadas
            const formattedResult = result.map((attendance) => {
                let hoursWorked = 0;

                if (attendance.check_out_time && attendance.check_in_time) {
                    hoursWorked = dayjs(attendance.check_out_time).diff(
                        dayjs(attendance.check_in_time),
                        "hour",
                        true
                    );
                }

                const roundedHours = parseFloat(hoursWorked.toFixed(2));
                const calculatedPrice = attendance.user.hourly_price
                    ? attendance.user.hourly_price * roundedHours
                    : 0;

                totalPrice += calculatedPrice;
                totalHours += roundedHours;

                return {
                    ...attendance,
                    hours_worked: roundedHours,
                    price: calculatedPrice,
                };
            });

            // Contar serviços dentro do período
            const serviceCount = await prisma.serviceProject.count({
                where: {
                    AND: [
                        {
                            UserServiceProject: {
                                some: {
                                    user_attendances: {
                                        some: {
                                            date: {
                                                gte: new Date(String(start_date)), // Converter para formato Date
                                                lte: new Date(String(deadline)),
                                            },
                                        }
                                    }
                                }
                            }

                        },
                        {
                            company_id: String(id),
                        },
                        {
                            UserServiceProject: {
                                every: {
                                    user_id: String(worker_id)
                                }
                            }
                        }
                    ],
                },
            });

            // Contar projetos com status específicos dentro do período
            const projectCount = await prisma.project.count({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                            },
                        },
                        {
                            date_creation: {
                                gte: new Date(String(start_date)), // Converter para formato Date
                                lte: new Date(String(deadline)),
                            },
                        },
                        {
                            company_id: String(id),
                        },
                        {
                            serviceProject: {
                                some: {
                                    UserServiceProject: {
                                        some: {
                                            user_attendances: {
                                                some: {
                                                    date: {
                                                        gte: new Date(String(start_date)), // Converter para formato Date
                                                        lte: new Date(String(deadline)),
                                                    },
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ],
                },
            });
            const urlAvatar = await getPresignedUrl(String(existWorker?.avatar))
            // Retornar os indicadores e a lista de trabalhadores formatada
            return res.json(
                {
                    indicators: {
                        totalPrice: parseFloat(totalPrice.toFixed(2)),
                        totalHours: parseFloat(totalHours.toFixed(2)),
                        totalServices: serviceCount,
                        totalProjects: projectCount,
                    },
                    userWorker: {
                        id: existWorker?.id,
                        name: existWorker?.name,
                        avatar: urlAvatar,
                        office: existWorker?.office.name
                    },
                    workers: formattedResult,
                    totalPages: Math.ceil(resultCount / 10)
                }
            );
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async findManyActivies(req: Request, res: Response) {
        const { id, start_date, deadline, page } = req.query;
        try {
            // Verificar se os parâmetros obrigatórios estão presentes
            if (!id || !page) {
                return res.status(400).json({ error: "Params invalid" });
            }

            // Verificar se a empresa existe
            const existCompany = await prisma.company.findUnique({
                where: { id: String(id) },
            });

            if (!existCompany) {
                return res.status(404).json({ error: "Company not found" });
            }

            let totalPrice = 0;
            let totalHours = 0;

            // Buscar dados de presenças de usuários
            const result = await prisma.userAttendance.findMany({
                where: {

                    AND: [
                        {
                            date: {
                                gte: new Date(String(start_date)), // Converter para formato Date
                                lte: new Date(String(deadline)),
                            },
                        },
                        {
                            company_id: { equals: String(id) },
                        },
                    ],

                },
                include: {
                    UserServiceProject: {
                        select: {
                            service_project: {
                                select: {
                                    name: true,                                    
                                },
                            },
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            avatar: true,
                            hourly_price: true,
                        },
                    },

                },
                orderBy: {
                    check_in_time: "desc"
                },
                skip: Number(page) * 10,
                take: 10,
            });

            // Formatar e calcular horas trabalhadas
            const formattedResult = result.map((attendance) => {
                let hoursWorked = 0;

                if (attendance.check_out_time && attendance.check_in_time) {
                    hoursWorked = dayjs(attendance.check_out_time).diff(
                        dayjs(attendance.check_in_time),
                        "hour",
                        true
                    );
                }

                const roundedHours = parseFloat(hoursWorked.toFixed(2));
                const calculatedPrice = attendance.user.hourly_price
                    ? attendance.user.hourly_price * roundedHours
                    : 0;

                totalPrice += calculatedPrice;
                totalHours += roundedHours;

                return {
                    name: attendance.user.name,
                    serviceName: attendance.UserServiceProject.service_project.name,
                    address: attendance.check_in_address,
                    status: attendance.check_out_time ? 'Out' : 'In'
                };
            });

            // Contar serviços dentro do período
            const serviceCount = await prisma.serviceProject.count({
                where: {
                    AND: [
                        {
                            UserServiceProject: {
                                some: {
                                    user_attendances: {
                                        some: {}
                                    }
                                }
                            }

                        },
                        {
                            company_id: String(id),
                        },
                        
                    ],
                },
            });

            // Contar projetos com status específicos dentro do período
            const projects = await prisma.project.findMany({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough"],
                            },
                        },

                        {
                            company_id: String(id),
                        },
                        {
                            serviceProject: {
                                some: {
                                    UserServiceProject: {
                                        some: {
                                            user_attendances: {
                                                some: {
                                                    AND: [
                                                        {},
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ],
                },                
            });



            // Retornar os indicadores e a lista de trabalhadores formatada
            return res.json(
                {
                    indicators: {
                        totalIn: formattedResult.filter(i=>i.status=='In').length,
                        totalOut: formattedResult.filter(i => i.status == 'Out').length,
                        totalServices: serviceCount,
                        totalProjects: projects.length,
                    },
                    workers: formattedResult,
                    totalPages: Math.ceil(formattedResult.length / 10)
                }
            );
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
