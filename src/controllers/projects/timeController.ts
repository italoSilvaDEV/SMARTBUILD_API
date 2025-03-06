import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import dayjs from "dayjs";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

interface IFindProject {
    company_id: string,
    search?: string,
    start_date: string,
    deadline: string,
    pag: number
}

interface WorkerGroup {
    user: {
        id: string;
        name: string;
        hourly_price: number | null;
    };
    hours_worked: number;
    price: number;
}

async function findProject(data: IFindProject) {
    const startDate = new Date(String(data.start_date));
    startDate.setHours(0, 0, 0, 0); // Ajusta para 00:00 no horário local

    const deadline = new Date(String(data.deadline));
    deadline.setHours(23, 59, 0, 0); // Ajusta para 23:59 no horário local
    const whereCondition = {
        AND: [
            {
                status_project: {
                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                },
            },
            {
                company_id: data.company_id,
            },
            {
                serviceProject: {
                    some: {
                        UserServiceProject: {
                            some: {
                                user_attendances: {
                                    some: {
                                        AND: [
                                            data.search ? {
                                                user: {
                                                    name: {
                                                        contains: String(data.search),
                                                    }
                                                },
                                            } : {},
                                            {
                                                AND: [
                                                    {
                                                        check_in_time: {
                                                            gte: startDate, // Converter para formato Date

                                                        },
                                                    },
                                                    {
                                                        OR: [
                                                            {
                                                                check_out_time: {
                                                                    lte: deadline // Converter para formato Date
                                                                },
                                                            },
                                                            {
                                                                check_out_time: null
                                                            }
                                                        ]

                                                    }
                                                ]
                                            }
                                        ]
                                    }
                                },
                            }
                        }
                    }
                }
            }
        ]
    };
    const [projects, projectsCount] = await Promise.all([
        prisma.project.findMany({
            where: whereCondition,
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
                        name: true,
                        UserServiceProject: {
                            select: {
                                user_attendances: {
                                    include: {
                                        user: {
                                            select: {
                                                name: true,
                                                hourly_price: true,
                                                id: true
                                            }
                                        }
                                    },
                                    orderBy: {
                                        check_in_time: 'asc'
                                    }
                                }
                            }
                        }
                    },
                }
            },
            skip: Number(data.pag) * 10,
            take: 10,
        }),
        prisma.project.count({ where: whereCondition })
    ]);

    return { projects, projectsCount };
}

// Adicionar nova função para buscar todos os registros de attendance
async function findAllAttendances(companyId: string, search: string | undefined, startDate: Date, deadline: Date) {
    return await prisma.userAttendance.findMany({
        where: {
            AND: [
                search ? {
                    user: {
                        name: {
                            contains: String(search),
                        }
                    },
                } : {},
                {
                    check_in_time: {
                        gte: startDate,
                    },
                },
                {
                    OR: [
                        {
                            check_out_time: {
                                lte: deadline
                            },
                        },
                        {
                            check_out_time: null
                        }
                    ]
                },
                {
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
                }
            ]
        },
        include: {
            user: {
                select: {
                    name: true,
                    hourly_price: true,
                    id: true
                }
            }
        },
        orderBy: {
            check_in_time: 'asc'
        }
    });
}

export class TimeController {
    async findMany(req: Request, res: Response) {
        const page = Number(req.query.page);
        const { id, search, start_date, deadline } = req.query;
        try {
            // Verificar se os parâmetros obrigatórios estão presentes
            if (!id || !start_date || !deadline) {
                return res.status(400).json({ error: "Params invalid" });
            }

            // Verificar se a empresa existe
            const existCompany = await prisma.company.findUnique({
                where: { id: String(id) },
            });

            if (!existCompany) {
                return res.status(404).json({ error: "Company not found" });
            }

        

            const startDate = new Date(String(start_date));
            startDate.setHours(0, 0, 0, 0); // Ajusta para 00:00 no horário local

            const newDeadline = new Date(String(deadline));
            newDeadline.setHours(23, 59, 0, 0); // Ajusta para 23:59 no horário local
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
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate, // Converter para formato Date

                                    },
                                },
                                {
                                    OR: [
                                        {
                                            check_out_time: {
                                                lte: newDeadline, // Converter para formato Date

                                            },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ]

                                }
                            ]

                        },
                        {
                            UserServiceProject: {
                                service_project: {
                                    Project: {
                                        AND: [
                                            {
                                                company_id: { equals: String(id) },
                                            },
                                            {
                                                status_project: {
                                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                                },
                                            },
                                        ]
                                    }
                                }
                            }
                        },
                    ],
                },
            })




            // Ajustar a paginação dos projetos
            const { projects, projectsCount } = await findProject({
                company_id: String(id),
                search: String(search),
                deadline: String(deadline),
                start_date: String(start_date),
                pag: page // Usar o valor da página diretamente
            })

            // Buscar todos os registros de attendance
            const allAttendances = await findAllAttendances(
                String(id),
                String(search),
                startDate,
                newDeadline
            );

            // Processar todos os registros
            const allFormattedAttendances = allAttendances.map(x => {
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

                return {
                    user: x.user,
                    hours_worked: roundedHours,
                    price: calculatedPrice
                };
            });

            // Agrupar por usuário
            const workersGroupedByUser = allFormattedAttendances.reduce((acc: Record<string, WorkerGroup>, current) => {
                const userId = current.user.id;
                
                if (!acc[userId]) {
                    acc[userId] = {
                        user: current.user,
                        hours_worked: 0,
                        price: 0
                    };
                }
                
                acc[userId].hours_worked += current.hours_worked;
                acc[userId].price += current.price;
                
                return acc;
            }, {});

            const consolidatedWorkers = Object.values(workersGroupedByUser).map((worker) => ({
                user: (worker as WorkerGroup).user,
                hours_worked: parseFloat((worker as WorkerGroup).hours_worked.toFixed(2)),
                price: parseFloat((worker as WorkerGroup).price.toFixed(2))
            }));

            // Ajustar a paginação dos workers
            const pageSize = 10;
            const skip = page * pageSize; // Remover o -1 pois agora usamos a página como está
            const consolidatedWorkersPage = consolidatedWorkers
                .sort((a, b) => a.user.name.localeCompare(b.user.name))
                .slice(skip, skip + pageSize);

            return res.json({
                indicators: {
                    totalPrice: parseFloat(consolidatedWorkers.reduce((acc, i) => acc + i.price, 0).toFixed(2)),
                    totalHours: parseFloat(consolidatedWorkers.reduce((acc, i) => acc + i.hours_worked, 0).toFixed(2)),
                    totalServices: resultCount,
                    totalProjects: projectsCount,
                },
                projects: projects.map(i => ({
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
                })),
                workers: consolidatedWorkersPage,
                totalPages: Math.ceil(consolidatedWorkers.length / pageSize)
            });
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

            const startDate = new Date(String(start_date));
            startDate.setHours(0, 0, 0, 0);

            const newDeadline = new Date(String(deadline));
            newDeadline.setHours(23, 59, 0, 0);

            // Verificar se a empresa existe
            const existWorker = await prisma.user.findUnique({
                where: { id: String(worker_id) },
                include: { 
                    office: true,
                    UserAttendance: {
                        where: {
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                },
                                {
                                    OR: [
                                        {
                                            check_out_time: {
                                                lte: newDeadline,
                                            },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            });

            // Contagem de atendimentos do worker específico
            const resultCount = await prisma.userAttendance.count({
                where: {
                    AND: [
                        { user_id: String(worker_id) },
                        {
                            check_in_time: {
                                gte: startDate,
                            },
                        },
                        {
                            OR: [
                                {
                                    check_out_time: {
                                        lte: newDeadline,
                                    },
                                },
                                {
                                    check_out_time: null
                                }
                            ]
                        },
                        {
                            UserServiceProject: {
                                service_project: {
                                    Project: {
                                        company_id: String(id),
                                        status_project: {
                                            in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                        }
                                    }
                                }
                            }
                        }
                    ]
                },
                
            });

            // Contagem de serviços do worker específico
            const serviceCount = await prisma.serviceProject.count({
                where: {
                    AND: [
                        {
                            UserServiceProject: {
                                some: {
                                    user_id: String(worker_id),
                                    user_attendances: {
                                        some: {
                                            check_in_time: {
                                                gte: startDate,
                                            },
                                            OR: [
                                                {
                                                    check_out_time: {
                                                        lte: newDeadline,
                                                    },
                                                },
                                                {
                                                    check_out_time: null
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        },
                        {
                            Project: {
                                company_id: String(id),
                                status_project: {
                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                }
                            }
                        }
                    ]
                }
            });

            // Buscar projetos específicos do worker
            const projects = await prisma.project.findMany({
                where: {
                    AND: [
                        {
                            company_id: String(id),
                        },
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough"],
                            },
                        },
                        {
                            serviceProject: {
                                some: {
                                    UserServiceProject: {
                                        some: {
                                            user_id: String(worker_id),
                                            user_attendances: {
                                                some: {
                                                    check_in_time: {
                                                        gte: startDate,
                                                    },
                                                    OR: [
                                                        {
                                                            check_out_time: {
                                                                lte: newDeadline,
                                                            },
                                                        },
                                                        {
                                                            check_out_time: null
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    ]
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
                                where: {
                                    user_id: String(worker_id)
                                },
                                include: {
                                    user_attendances: {
                                        include: {
                                            user: {
                                                select: {
                                                    name: true,
                                                    hourly_price: true
                                                }
                                            }
                                        },
                                        orderBy: {
                                            check_in_time: 'asc'
                                        }
                                    }
                                }
                            }
                        },
                    }
                }
            });

            // Calcular horas trabalhadas apenas para o worker específico
            const formattedResult = projects.flatMap(i => i.serviceProject
                .filter(s => s.UserServiceProject.length > 0)
                .flatMap(s => s.UserServiceProject
                    .filter(user => user.user_attendances.length > 0)
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
                                ...x,
                                userId: x.user_id,
                                hours_worked: roundedHours,
                                price: calculatedPrice
                            })
                        })
                    )
                )
            );

            const urlAvatar = await getPresignedUrl(String(existWorker?.avatar));

            return res.json({
                indicators: {
                    totalPrice: parseFloat(formattedResult.reduce((acc, i) => acc + (i.price || 0), 0).toFixed(2)),
                    totalHours: parseFloat(formattedResult.reduce((acc, i) => acc + (i.hours_worked || 0), 0).toFixed(2)),
                    totalServices: serviceCount,
                    totalProjects: projects.length,
                },
                userWorker: {
                    id: existWorker?.id,
                    name: existWorker?.name,
                    avatar: urlAvatar,
                    office: existWorker?.office.name
                },
                workers: formattedResult,
                totalPages: Math.ceil(resultCount / 10)
            });

        } catch (error) {
            console.error("Error in findManyByIdWorker:", error);
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
            if (!id || !start_date || !deadline) {
                return res.status(400).json({ error: "Params invalid" });
            }

            // Verificar se a empresa existe
            const existCompany = await prisma.company.findUnique({
                where: { id: String(id) },
            });

            if (!existCompany) {
                return res.status(404).json({ error: "Company not found" });
            }
            const startDate = new Date(String(start_date));
            startDate.setHours(0, 0, 0, 0); // Ajusta para 00:00 no horário local

            const newDeadline = new Date(String(deadline));
            newDeadline.setHours(23, 59, 0, 0); // Ajusta para 23:59 no horário local
            const resultCount = await prisma.userAttendance.count({
                where: {
                    AND: [
                        {
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate, // Converter para formato Date

                                    },
                                },
                                {
                                    OR: [
                                        {
                                            check_out_time: {
                                                lte: newDeadline, // Converter para formato Date

                                            },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ]

                                }
                            ]

                        },
                        {
                            UserServiceProject: {
                                service_project: {
                                    Project: {
                                        AND: [
                                            {
                                                company_id: { equals: String(id) },
                                            },
                                            {
                                                status_project: {
                                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                                },
                                            },
                                        ]
                                    }
                                }
                            }
                        },

                    ],
                },
            })

            // Contar projetos com status específicos dentro do período
            const { projects, projectsCount } = await findProject({
                company_id: String(id),
                deadline: String(deadline),
                start_date: String(start_date),
                pag: Number(page)
            })
            // // Formatar e calcular horas trabalhadas
            // const formattedResult = projects.flatMap(i => i.serviceProject
            //     .filter(s => s.UserServiceProject.length > 0) // Filtra para garantir que há dados em UserServiceProject
            //     .flatMap(s => s.UserServiceProject
            //         .filter(user => user.user_attendances.length > 0) // Filtra para garantir que há dados em user_attendances
            //         .flatMap(user => user.user_attendances
            //             .map(x => {
            //                 return {
            //                     name: x.user.name,
            //                     serviceName: s.name,
            //                     address: x.check_in_address,
            //                     status: x.check_out_time ? 'Out' : 'In'
            //                 };
            //             })
            //         )
            //     )
            // );

            // const uniqueUserServiceProjectIds = new Set(
            //     projects.flatMap(i =>
            //         i.serviceProject
            //             .filter(s => s.UserServiceProject.length > 0) // Garante que há dados em UserServiceProject
            //             .flatMap(s =>
            //                 s.UserServiceProject
            //                     .filter(user => user.user_attendances.length > 0)
            //                     .flatMap(user =>
            //                         user.user_attendances.map(x => x.user_service_project_id)
            //                     )
            //             )
            //     )
            // );
            // Coletar todas as entradas de attendance com informações necessárias
            const allEntries = projects.flatMap(project =>
                project.serviceProject
                    .filter(service => service.UserServiceProject.length > 0)
                    .flatMap(service =>
                        service.UserServiceProject
                            .filter(userService => userService.user_attendances.length > 0)
                            .flatMap(userService =>
                                userService.user_attendances.map(attendance => ({
                                    name: attendance.user.name,
                                    serviceName: service.name,
                                    address: attendance.check_in_address,
                                    status: attendance.check_out_time ? 'Out' : 'In',
                                    check_in_time: attendance.check_in_time,
                                    userId: attendance.user.id,
                                    user_service_project_id: attendance.user_service_project_id
                                }))
                            )
                    )
            );

            // Reduzir para obter o attendance mais recente por usuário
            const latestEntriesMap = allEntries.reduce((map, entry) => {
                const existing = map.get(entry.userId);
                if (!existing || new Date(entry.check_in_time) > new Date(existing.check_in_time)) {
                    map.set(entry.userId, entry);
                }
                return map;
            }, new Map());

            // Formatar o resultado final
            const formattedResult = Array.from(latestEntriesMap.values()).map(entry => ({
                name: entry.name,
                serviceName: entry.serviceName,
                address: entry.address,
                status: entry.status
            }));

            // Obter os IDs únicos de UserServiceProject dos registros mais recentes
            const uniqueUserServiceProjectIds = new Set(
                Array.from(latestEntriesMap.values()).map(entry => entry.user_service_project_id)
            );
            // Contagem dos IDs únicos
            const serviceCount = uniqueUserServiceProjectIds.size;
            // Retornar os indicadores e a lista de trabalhadores formatada
            return res.json(
                {
                    indicators: {
                        totalIn: formattedResult.filter(i => i.status == 'In').length,
                        totalOut: formattedResult.filter(i => i.status == 'Out').length,
                        totalServices: serviceCount,
                        totalProjects: projectsCount,
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
}