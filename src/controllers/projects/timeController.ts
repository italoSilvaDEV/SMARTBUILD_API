import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { DateTime } from "luxon";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from "../../utils/calculaHoraExtra";

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
        isOverTime: boolean | null;
    };
    hours_worked: number;
    regular_hours: number;
    overtime_hours: number;
    price: number;
}

function getWeekKey(date: Date): string {
    const dateTime = DateTime.fromJSDate(date);
    const startOfWeek = dateTime.weekday === 7 ? dateTime.startOf('day') : dateTime.minus({ days: dateTime.weekday }).startOf('day');
    return startOfWeek.toFormat('yyyy-MM-dd');
}

// Helper function to calculate regular and overtime hours
function calculateHours(checkIn: Date, checkOut: Date, workStartTime?: string | null, workEndTime?: string | null, isOverTime?: boolean) {
    const checkInTime = DateTime.fromJSDate(checkIn);
    const checkOutTime = DateTime.fromJSDate(checkOut);

    // If work times are not defined or invalid, treat all hours as regular
    if (!workStartTime || !workEndTime || !workStartTime.includes(':') || !workEndTime.includes(':')) {
        return {
            regularHours: Math.ceil(checkOutTime.diff(checkInTime, 'hours').hours),
            overtimeHours: 0
        };
    }

    // Convert work start/end times to DateTime objects for the same day as check-in
    const [startHour, startMinute] = workStartTime.split(':').map(Number);
    const [endHour, endMinute] = workEndTime.split(':').map(Number);

    // Validate hour and minute values
    if (isNaN(startHour) || isNaN(startMinute) || isNaN(endHour) || isNaN(endMinute) ||
        startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 ||
        startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
        return {
            regularHours: Math.ceil(checkOutTime.diff(checkInTime, 'hours').hours),
            overtimeHours: 0
        };
    }

    const workStart = checkInTime.set({ hour: startHour, minute: startMinute });
    const workEnd = checkInTime.set({ hour: endHour, minute: endMinute });

    // If not eligible for overtime, return all hours as regular
    if (!isOverTime) {
        return {
            regularHours: Math.ceil(checkOutTime.diff(checkInTime, 'hours').hours),
            overtimeHours: 0
        };
    }

    // Calculate total hours worked
    const totalHours = checkOutTime.diff(checkInTime, 'hours').hours;

    // Calculate regular work day hours
    const regularWorkHours = workEnd.diff(workStart, 'hours').hours;

    // If worked more than regular hours, calculate overtime
    if (totalHours > regularWorkHours) {
        return {
            regularHours: Math.ceil(regularWorkHours),
            overtimeHours: Math.ceil(totalHours - regularWorkHours)
        };
    }

    return {
        regularHours: Math.ceil(totalHours),
        overtimeHours: 0
    };
}


async function findProject(data: IFindProject) {
    const startDate = DateTime.fromISO(String(data.start_date))
        .startOf('day')
        .toJSDate();

    const deadline = DateTime.fromISO(String(data.deadline))
        .endOf('day')
        .toJSDate();
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
                                                            gte: startDate,
                                                        },
                                                    }, {
                                                        OR: [
                                                            {
                                                                check_out_time: { lte: deadline, },
                                                            },
                                                            {
                                                                check_out_time: null
                                                            }
                                                        ],
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
                                                id: true,
                                                isOverTime: true
                                            }
                                        }
                                    },
                                    orderBy: {
                                        check_in_time: 'desc'
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

                    AND: [
                        {
                            check_in_time: {
                                gte: startDate,
                            },
                        }, {
                            OR: [
                                {
                                    check_out_time: { lte: deadline, },
                                },
                                {
                                    check_out_time: null
                                }
                            ],
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
                    id: true,
                    isOverTime: true
                }
            }
        },
        orderBy: {
            check_in_time: 'desc'
        }
    });
}

export class TimeController {
    async findMany(req: Request, res: Response) {
        const page = Number(req.query.page);
        const { id, search, start_date, deadline } = req.query;
        try {
            if (!id || !start_date || !deadline) {
                return res.status(400).json({ error: "Params invalid" });
            }

            const existCompany = await prisma.company.findUnique({
                where: { id: String(id) },
            });

            if (!existCompany) {
                return res.status(404).json({ error: "Company not found" });
            }

            const startDate = DateTime.fromISO(String(start_date)).startOf('day').toJSDate();
            const newDeadline = DateTime.fromISO(String(deadline)).endOf('day').toJSDate();

            const resultCount = await prisma.userAttendance.findMany({
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
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                }, {
                                    OR: [
                                        {
                                            check_out_time: { lte: newDeadline, },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ],
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
                distinct: ['user_id'] as const,
                select: { user_id: true }
            }).then(results => results.length);

            const { projects, projectsCount } = await findProject({
                company_id: String(id),
                search: String(search),
                deadline: String(deadline),
                start_date: String(start_date),
                pag: page
            })

            const allAttendances = await findAllAttendances(
                String(id),
                String(search),
                startDate,
                newDeadline
            );

            const attendancesByUser = allAttendances.reduce((users, attendance) => {
                const userId = attendance.user.id;
                if (!users[userId]) {
                    users[userId] = [];
                }
                users[userId].push(attendance);
                return users;
            }, {} as Record<string, typeof allAttendances>);

            const allFormattedAttendances: any[] = [];

            Object.values(attendancesByUser).forEach(userAttendances => {
                const attendancesByWeek = userAttendances.reduce((weeks, attendance) => {
                    if (attendance.check_out_time && attendance.check_in_time) {
                        const weekKey = getWeekKey(attendance.date);
                        if (!weeks[weekKey]) {
                            weeks[weekKey] = [];
                        }
                        weeks[weekKey].push(attendance);
                    }
                    return weeks;
                }, {} as Record<string, typeof userAttendances>);

                Object.values(attendancesByWeek).forEach(weekAttendances => {
                    let totalWeekHours = 0;
                    const attendancesWithHours = weekAttendances.map(attendance => {
                        const hours = calcularHorasTrabalhadas(
                            attendance.check_in_time!.toISOString(),
                            attendance.check_out_time!.toISOString(),
                            attendance.workStartTime,
                            attendance.workEndTime,
                        );
                        const dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                        totalWeekHours += dailyHours;
                        return { ...attendance, dailyHours };
                    });

                    let weekRegularHours = 0;
                    let weekOvertimeHours = 0;

                    const userHasOvertime = weekAttendances[0].user.isOverTime;

                    if (userHasOvertime && totalWeekHours > 40) {
                        weekRegularHours = 40;
                        weekOvertimeHours = totalWeekHours - 40;
                    } else {
                        weekRegularHours = totalWeekHours;
                        weekOvertimeHours = 0;
                    }

                    const weeklyPrice = weekAttendances[0].user.hourly_price
                        ? userHasOvertime
                            ? (weekRegularHours * weekAttendances[0].user.hourly_price) + (weekOvertimeHours * weekAttendances[0].user.hourly_price * 1.5)
                            : (weekRegularHours * weekAttendances[0].user.hourly_price)
                        : 0;

                    const totalDailyHours = attendancesWithHours.reduce((sum, att) => sum + att.dailyHours, 0);

                    attendancesWithHours.forEach(attendance => {
                        const proportionalPrice = totalDailyHours > 0
                            ? (attendance.dailyHours / totalDailyHours) * weeklyPrice
                            : 0;

                        let dailyRegularHours = 0;
                        let dailyOvertimeHours = 0;

                        if (userHasOvertime && totalWeekHours > 40) {
                            const regularProportion = weekRegularHours / totalWeekHours;
                            const overtimeProportion = weekOvertimeHours / totalWeekHours;

                            dailyRegularHours = attendance.dailyHours * regularProportion;
                            dailyOvertimeHours = attendance.dailyHours * overtimeProportion;
                        } else {
                            dailyRegularHours = attendance.dailyHours;
                            dailyOvertimeHours = 0;
                        }

                        allFormattedAttendances.push({
                            user: attendance.user,
                            hours_worked: attendance.dailyHours,
                            regular_hours: parseFloat(dailyRegularHours.toFixed(2)),
                            overtime_hours: parseFloat(dailyOvertimeHours.toFixed(2)),
                            price: parseFloat(proportionalPrice.toFixed(2))
                        });
                    });
                });
            });

            const workersGroupedByUser = allFormattedAttendances.reduce((acc: Record<string, WorkerGroup>, current) => {
                const userId = current.user.id;

                if (!acc[userId]) {
                    acc[userId] = {
                        user: current.user,
                        hours_worked: 0,
                        regular_hours: 0,
                        overtime_hours: 0,
                        price: 0
                    };
                }

                acc[userId].hours_worked += current.hours_worked;
                acc[userId].regular_hours += current.regular_hours;
                acc[userId].overtime_hours += current.overtime_hours;
                acc[userId].price += current.price;

                return acc;
            }, {});

            const consolidatedWorkers = Object.values(workersGroupedByUser).map((worker) => ({
                user: (worker as WorkerGroup).user,
                hours_worked: parseFloat((worker as WorkerGroup).hours_worked.toFixed(2)),
                regular_hours: parseFloat((worker as WorkerGroup).regular_hours.toFixed(2)),
                overtime_hours: parseFloat((worker as WorkerGroup).overtime_hours.toFixed(2)),
                price: parseFloat((worker as WorkerGroup).price.toFixed(2))
            }));

            const pageSize = 10;
            const skip = page * pageSize;
            const consolidatedWorkersPage = consolidatedWorkers
                .sort((a, b) => a.user.name.localeCompare(b.user.name))
                .slice(skip, skip + pageSize);

            return res.json({
                indicators: {
                    totalPrice: parseFloat(consolidatedWorkers.reduce((acc, i) => acc + i.price, 0).toFixed(2)),
                    totalHours: parseFloat(consolidatedWorkers.reduce((acc, i) => acc + i.hours_worked, 0).toFixed(2)),
                    totalRegularHours: parseFloat(consolidatedWorkers.reduce((acc, i) => acc + i.regular_hours, 0).toFixed(2)),
                    totalOvertimeHours: parseFloat(consolidatedWorkers.reduce((acc, i) => acc + i.overtime_hours, 0).toFixed(2)),
                    totalServices: resultCount,
                    totalProjects: projectsCount,
                },
                projects: projects.map(i => ({
                    clientData: i.client?.name + ' - ' + i.client?.location,
                    clientName: i.client?.name,
                    clientAddress: i.client?.location,
                    clientCityAndState: i.client?.city_and_state,
                    serviceCount: i.serviceProject.length,
                    workerData: (() => {
                        const projectAttendances = i.serviceProject
                            .filter(s => s.UserServiceProject.length > 0)
                            .flatMap(s => s.UserServiceProject
                                .filter(user => user.user_attendances.length > 0)
                                .flatMap(user => user.user_attendances
                                    .filter(x => x.check_out_time && x.check_in_time)
                                    .map(x => ({ ...x, serviceName: s.name }))
                                )
                            );

                        const attendancesByUser = projectAttendances.reduce((users, attendance) => {
                            const userId = attendance.user.id;
                            if (!users[userId]) {
                                users[userId] = [];
                            }
                            users[userId].push(attendance);
                            return users;
                        }, {} as Record<string, typeof projectAttendances>);

                        const result: any[] = [];

                        Object.values(attendancesByUser).forEach(userAttendances => {
                            const attendancesByWeek = userAttendances.reduce((weeks, attendance) => {
                                const weekKey = getWeekKey(attendance.date);
                                if (!weeks[weekKey]) {
                                    weeks[weekKey] = [];
                                }
                                weeks[weekKey].push(attendance);
                                return weeks;
                            }, {} as Record<string, typeof userAttendances>);

                            Object.values(attendancesByWeek).forEach(weekAttendances => {
                                let totalWeekHours = 0;
                                const attendancesWithHours = weekAttendances.map(attendance => {
                                    const hours = calcularHorasTrabalhadas(
                                        attendance.check_in_time!.toISOString(),
                                        attendance.check_out_time!.toISOString(),
                                        attendance.workStartTime,
                                        attendance.workEndTime,
                                    );
                                    const dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                                    totalWeekHours += dailyHours;
                                    return { ...attendance, dailyHours };
                                });

                                let weekRegularHours = 0;
                                let weekOvertimeHours = 0;

                                const userHasOvertime = weekAttendances[0]?.user?.isOverTime;

                                if (userHasOvertime && totalWeekHours > 40) {
                                    weekRegularHours = 40;
                                    weekOvertimeHours = totalWeekHours - 40;
                                } else {
                                    weekRegularHours = totalWeekHours;
                                    weekOvertimeHours = 0;
                                }

                                const weeklyPrice = weekAttendances[0]?.user?.hourly_price
                                    ? userHasOvertime
                                        ? (weekRegularHours * weekAttendances[0].user.hourly_price) + (weekOvertimeHours * weekAttendances[0].user.hourly_price * 1.5)
                                        : (weekRegularHours * weekAttendances[0].user.hourly_price)
                                    : 0;

                                const totalDailyHours = attendancesWithHours.reduce((sum, att) => sum + att.dailyHours, 0);

                                attendancesWithHours.forEach(attendance => {
                                    const proportionalPrice = totalDailyHours > 0
                                        ? (attendance.dailyHours / totalDailyHours) * weeklyPrice
                                        : 0;

                                    let dailyRegularHours = 0;
                                    let dailyOvertimeHours = 0;

                                    if (userHasOvertime && totalWeekHours > 40) {
                                        const regularProportion = weekRegularHours / totalWeekHours;
                                        const overtimeProportion = weekOvertimeHours / totalWeekHours;
                                        dailyRegularHours = attendance.dailyHours * regularProportion;
                                        dailyOvertimeHours = attendance.dailyHours * overtimeProportion;
                                    } else {
                                        dailyRegularHours = attendance.dailyHours;
                                        dailyOvertimeHours = 0;
                                    }

                                    result.push({
                                        nameWorker: attendance.user.name,
                                        date: attendance.date,
                                        in: attendance.check_in_time,
                                        out: attendance.check_out_time,
                                        regular_hours: parseFloat(dailyRegularHours.toFixed(2)),
                                        overtime_hours: parseFloat(dailyOvertimeHours.toFixed(2)),
                                        total_hours: attendance.dailyHours,
                                        price: parseFloat(proportionalPrice.toFixed(2))
                                    });
                                });
                            });
                        });

                        return result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                    })()
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
        const { worker_id, start_date, deadline, page } = req.query;
        try {
            // Verificar se os parâmetros obrigatórios estão presentes
            if (!worker_id || !start_date || !deadline || !page) {
                return res.status(400).json({ error: "Params invalid" });
            }


            const startDate = DateTime.fromISO(String(start_date))
                .startOf('day')
                .toJSDate();

            const newDeadline = DateTime.fromISO(String(deadline))
                .endOf('day')
                .toJSDate();

            // Verificar se a empresa existe
            const existWorker = await prisma.user.findUnique({
                where: { id: String(worker_id) },
                include: {
                    company: true,
                    office: true,
                    UserAttendance: {
                        where: {
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                }, {
                                    OR: [
                                        {
                                            check_out_time: { lte: newDeadline, },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ],
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
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                }, {
                                    OR: [
                                        {
                                            check_out_time: { lte: newDeadline, },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ],
                                }
                            ]
                        },
                        {
                            UserServiceProject: {
                                service_project: {
                                    Project: {
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
                                            AND: [
                                                {
                                                    check_in_time: {
                                                        gte: startDate,
                                                    },
                                                }, {
                                                    OR: [
                                                        {
                                                            check_out_time: { lte: newDeadline, },
                                                        },
                                                        {
                                                            check_out_time: null
                                                        }
                                                    ],
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        },
                        {
                            Project: {
                                status_project: {
                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                }
                            }
                        }
                    ]
                }
            });

            // Buscar projetos específicos do worker - CORRIGIDO PARA USAR O MESMO PADRÃO DE FILTRO DE DATA
            const projects = await prisma.project.findMany({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
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
                                                    AND: [
                                                        {
                                                            check_in_time: {
                                                                gte: startDate,
                                                            },
                                                        }, {
                                                            OR: [
                                                                {
                                                                    check_out_time: { lte: newDeadline, },
                                                                },
                                                                {
                                                                    check_out_time: null
                                                                }
                                                            ],
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
                            name: true, // Adicionado o nome do serviço para exibição
                            UserServiceProject: {
                                where: {
                                    user_id: String(worker_id)
                                },
                                include: {
                                    user_attendances: {
                                        where: { // Aplicar o mesmo filtro de data aqui também
                                            AND: [
                                                {
                                                    check_in_time: {
                                                        gte: startDate,
                                                    },
                                                }, {
                                                    OR: [
                                                        {
                                                            check_out_time: { lte: newDeadline, },
                                                        },
                                                        {
                                                            check_out_time: null
                                                        }
                                                    ],
                                                }
                                            ]
                                        },
                                        include: {
                                            user: {
                                                select: {
                                                    name: true,
                                                    hourly_price: true,
                                                    isOverTime: true
                                                }
                                            }
                                        },
                                        orderBy: {
                                            check_in_time: 'desc'
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
                            let regularHours = 0;
                            let overtimeHours = 0;

                            if (x.check_out_time && x.check_in_time) {
                                const hours = calcularHorasTrabalhadas(
                                    x.check_in_time.toISOString(),
                                    x.check_out_time.toISOString(),
                                    x.workStartTime,
                                    x.workEndTime,
                                );
                                const dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);

                                const userHasOvertime = x.user.isOverTime === true;

                                if (!userHasOvertime) {
                                    regularHours = dailyHours;
                                    overtimeHours = 0;
                                } else {
                                    regularHours = convertHHMMToDecimal(hours.normais);
                                    overtimeHours = convertHHMMToDecimal(hours.extras);
                                }
                            }

                            const totalHours = regularHours + overtimeHours;
                            const calculatedPrice = x.user.hourly_price
                                ? (regularHours * x.user.hourly_price) + (overtimeHours * x.user.hourly_price * 1.5)
                                : 0;
                            return ({
                                ...x,
                                userId: x.user_id,
                                hours_worked: totalHours,
                                regular_hours: regularHours,
                                overtime_hours: overtimeHours,
                                price: calculatedPrice,
                                serviceName: s.name // Incluir o nome do serviço para melhor identificação
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
                    totalRegularHours: parseFloat(formattedResult.reduce((acc, i) => acc + (i.regular_hours || 0), 0).toFixed(2)),
                    totalOvertimeHours: parseFloat(formattedResult.reduce((acc, i) => acc + (i.overtime_hours || 0), 0).toFixed(2)),
                    totalServices: serviceCount,
                    totalProjects: projects.length,
                },
                userWorker: {
                    id: existWorker?.id,
                    name: existWorker?.name,
                    avatar: urlAvatar,
                    office: existWorker?.office.name
                },
                workers: formattedResult.sort((a, b) => new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime()),
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

    async findManyByIdWorkerWeb(req: Request, res: Response) {
        const { worker_id, start_date, deadline, page } = req.query;

        try {
            // Verificar se os parâmetros obrigatórios estão presentes
            if (!worker_id || !start_date || !deadline || !page) {
                return res.status(400).json({ error: "Params invalid" });
            }

            // ✅ ADICIONADO: Configuração de paginação
            const pageNumber = parseInt(String(page)) || 0;
            const pageSize = 10;
            const skip = pageNumber * pageSize;

            const startDate = DateTime.fromISO(String(start_date))
                .startOf('day')
                .toJSDate();

            const newDeadline = DateTime.fromISO(String(deadline))
                .endOf('day')
                .toJSDate();

            // Verificar se a empresa existe
            const existWorker = await prisma.user.findUnique({
                where: { id: String(worker_id) },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    hourly_price: true,
                    isOverTime: true,
                    company: true,
                    office: true,
                    UserAttendance: {
                        where: {
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                }, {
                                    OR: [
                                        {
                                            check_out_time: { lte: newDeadline, },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ],
                                }
                            ]
                        }
                    }
                }
            });

            await prisma.userAttendance.count({
                where: {
                    AND: [
                        { user_id: String(worker_id) },
                        {
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                }, {
                                    OR: [
                                        {
                                            check_out_time: { lte: newDeadline, },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ],
                                }
                            ]
                        },
                        {
                            UserServiceProject: {
                                service_project: {
                                    Project: {
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

            const serviceCount = await prisma.serviceProject.count({
                where: {
                    AND: [
                        {
                            UserServiceProject: {
                                some: {
                                    user_id: String(worker_id),
                                    user_attendances: {
                                        some: {
                                            AND: [
                                                {
                                                    check_in_time: {
                                                        gte: startDate,
                                                    },
                                                }, {
                                                    OR: [
                                                        {
                                                            check_out_time: { lte: newDeadline, },
                                                        },
                                                        {
                                                            check_out_time: null
                                                        }
                                                    ],
                                                }
                                            ]
                                        }
                                    }
                                }
                            }
                        },
                        {
                            Project: {
                                status_project: {
                                    in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                                }
                            }
                        }
                    ]
                }
            });

            const projects = await prisma.project.findMany({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
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
                                                    AND: [
                                                        {
                                                            check_in_time: {
                                                                gte: startDate,
                                                            },
                                                        }, {
                                                            OR: [
                                                                {
                                                                    check_out_time: { lte: newDeadline, },
                                                                },
                                                                {
                                                                    check_out_time: null
                                                                }
                                                            ],
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
                            name: true,
                            UserServiceProject: {
                                where: {
                                    user_id: String(worker_id)
                                },
                                include: {
                                    user_attendances: {
                                        where: {
                                            AND: [
                                                {
                                                    check_in_time: {
                                                        gte: startDate,
                                                    },
                                                }, {
                                                    OR: [
                                                        {
                                                            check_out_time: { lte: newDeadline, },
                                                        },
                                                        {
                                                            check_out_time: null
                                                        }
                                                    ],
                                                }
                                            ]
                                        },
                                        include: {
                                            user: {
                                                select: {
                                                    name: true,
                                                    hourly_price: true,
                                                    isOverTime: true
                                                }
                                            }
                                        },
                                        orderBy: {
                                            check_in_time: 'desc'
                                        }
                                    }
                                }
                            }
                        },
                    }
                }
            });

            const allAttendances = projects.flatMap(i => i.serviceProject
                .filter(s => s.UserServiceProject.length > 0)
                .flatMap(s => s.UserServiceProject
                    .filter(user => user.user_attendances.length > 0)
                    .flatMap(user => user.user_attendances
                        .map(x => ({
                            ...x,
                            userId: x.user_id,
                            serviceName: s.name
                        }))
                    )
                )
            );

            const attendancesByWeek = allAttendances.reduce((weeks, attendance) => {
                const weekKey = getWeekKey(attendance.check_in_time);

                if (!weeks[weekKey]) {
                    weeks[weekKey] = [];
                }

                weeks[weekKey].push(attendance);
                return weeks;
            }, {} as Record<string, any[]>);

            const formattedResult: any[] = [];

            Object.values(attendancesByWeek).forEach(weekAttendances => {
                const attendancesWithHours = weekAttendances.map(attendance => {
                    let dailyHours = 0;

                    if (attendance.check_out_time && attendance.check_in_time) {
                        const hours = calcularHorasTrabalhadas(
                            attendance.check_in_time.toISOString(),
                            attendance.check_out_time.toISOString(),
                            attendance.workStartTime,
                            attendance.workEndTime,
                        );
                        dailyHours = convertHHMMToDecimal(hours.normais) + convertHHMMToDecimal(hours.extras);
                    }

                    return { ...attendance, dailyHours };
                });

                attendancesWithHours.forEach(attendance => {
                    const userHasOvertime = attendance.user?.isOverTime === true;
                    const hourlyRate = attendance.user?.hourly_price || 0;

                    let dailyRegularHours = 0;
                    let dailyOvertimeHours = 0;
                    let dailyPrice = 0;

                    if (!userHasOvertime) {
                        dailyRegularHours = attendance.dailyHours;
                        dailyOvertimeHours = 0;
                        dailyPrice = attendance.dailyHours * hourlyRate;
                    } else {
                        const totalWeekHours = attendancesWithHours.reduce((sum, att) => sum + att.dailyHours, 0);

                        if (totalWeekHours <= 40) {
                            dailyRegularHours = attendance.dailyHours;
                            dailyOvertimeHours = 0;
                            dailyPrice = attendance.dailyHours * hourlyRate;
                        } else {
                            const weekRegularHours = 40;
                            const weekOvertimeHours = totalWeekHours - 40;

                            const regularProportion = weekRegularHours / totalWeekHours;
                            const overtimeProportion = weekOvertimeHours / totalWeekHours;

                            dailyRegularHours = attendance.dailyHours * regularProportion;
                            dailyOvertimeHours = attendance.dailyHours * overtimeProportion;
                            dailyPrice = (dailyRegularHours * hourlyRate) + (dailyOvertimeHours * hourlyRate * 1.5);
                        }
                    }

                    formattedResult.push({
                        ...attendance,
                        hours_worked: attendance.dailyHours,
                        regular_hours: parseFloat(dailyRegularHours.toFixed(2)),
                        overtime_hours: parseFloat(dailyOvertimeHours.toFixed(2)),
                        price: parseFloat(dailyPrice.toFixed(2))
                    });
                });
            });

            const sortedResult = formattedResult.sort((a, b) =>
                new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime()
            );

            const paginatedResult = sortedResult.slice(skip, skip + pageSize);

            const urlAvatar = await getPresignedUrl(String(existWorker?.avatar));

            return res.json({
                indicators: {
                    totalPrice: parseFloat(formattedResult.reduce((acc, i) => acc + (i.price || 0), 0).toFixed(2)),
                    totalHours: parseFloat(formattedResult.reduce((acc, i) => acc + (i.hours_worked || 0), 0).toFixed(2)),
                    totalRegularHours: parseFloat(formattedResult.reduce((acc, i) => acc + (i.regular_hours || 0), 0).toFixed(2)),
                    totalOvertimeHours: parseFloat(formattedResult.reduce((acc, i) => acc + (i.overtime_hours || 0), 0).toFixed(2)),
                    totalServices: serviceCount,
                    totalProjects: projects.length,
                },
                userWorker: {
                    id: existWorker?.id,
                    name: existWorker?.name,
                    avatar: urlAvatar,
                    office: existWorker?.office.name,
                    isOverTime: existWorker?.isOverTime
                },
                workers: paginatedResult,
                totalPages: Math.ceil(formattedResult.length / pageSize)
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
            const startDate = DateTime.fromISO(String(start_date))
                .startOf('day')
                .toJSDate();

            const newDeadline = DateTime.fromISO(String(deadline))
                .endOf('day')
                .toJSDate();
            const resultCount = await prisma.userAttendance.findMany({
                where: {
                    AND: [
                        {
                            check_in_time: {
                                gte: startDate,
                            },
                        },
                        {
                            AND: [
                                {
                                    check_in_time: {
                                        gte: startDate,
                                    },
                                }, {
                                    OR: [
                                        {
                                            check_out_time: { lte: newDeadline, },
                                        },
                                        {
                                            check_out_time: null
                                        }
                                    ],
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
                distinct: ['user_id'] as const,
                select: { user_id: true }
            },
            ).then(results => results.length);

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
                                    check_out_time: attendance.check_out_time,
                                    userId: attendance.user.id,
                                    user_service_project_id: attendance.user_service_project_id,
                                    client: {
                                        clientName: project.client?.name,
                                        clientAddress: project.location,
                                        clientCityAndState: project.client?.city_and_state
                                    }
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
                user_service_project_id: entry.user_service_project_id,
                name: entry.name,
                serviceName: entry.serviceName,
                address: entry.address,
                check_in_time: entry.check_in_time,
                check_out_time: entry.check_out_time,
                status: entry.status,
                client: {
                    clientName: entry.client.clientName,
                    clientAddress: entry.client.clientAddress,
                    clientCityAndState: entry.client.clientCityAndState
                }
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