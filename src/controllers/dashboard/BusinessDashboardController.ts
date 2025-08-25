import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { returnPayLoad } from '../../config/returnPayLoad';
import dayjs from 'dayjs';
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from '../../utils/calculaHoraExtra';
import { isMultiCompanyEnabled } from '../../helpers/featureToggle';

async function validCompany(request: Request) {
    const authHeader = returnPayLoad(request)
    const { companyId } = request.query

    if (authHeader == null) return {
        status: 'error',
        message: 'Token not found'
    };
    const user = await prisma.user.findUnique({
        where: {
            id: authHeader.id
        },
    })
    if (!user) return {
        status: 'error',
        message: 'User not found'
    };
    const isMultiCompany = await isMultiCompanyEnabled()
    let response;
    if (isMultiCompany) {
        response = await prisma.company.findUnique({
            where: {
                id: String(companyId)
            }
        })
    } else {
        response = await prisma.company.findUnique({
            where: {
                id: String(user.company_id)
            }
        })
    }
    if (response) {
        return {
            status: 'success',
            response,

        }
    }

    return {
        status: 'error',
        message: 'Company not found'
    };
}

function getDateRange(periodType: string) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date | undefined;

    switch (periodType) {
        case "thisYear":
            startDate = new Date(now.getFullYear(), 0, 1);
            break;

        case "thisQuarter":
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            break;

        case "last3Months":
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 3);
            break;

        case "lastMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case "thisMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;

        case "last30Days":
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
            break;

        case "allPeriod":
            startDate = new Date(2020, 0, 1);
            break;

        default:
            startDate = new Date(now.getFullYear(), 0, 1);
    }

    return { startDate, endDate };
}

export class BusinessDashboardController {
    async dashboardCards(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);

            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const [
                estimates,
                projects,
                customers,
                employees,
                inProgressProjects,
                pendingEstimates,
                completedProjects
            ] = await Promise.all([
                // Total Estimates
                prisma.estimate.count({
                    where: {
                        project: {
                            company_id: valid.response?.id
                        },
                        status: {
                            in: ["approved", "pending", "canceled"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // Total Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: {
                            in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),

                prisma.client.findMany({
                    where: {
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        }),
                        OR: [
                            { company_id: valid.response?.id },

                            {
                                projects: {
                                    some: {
                                        company_id: valid.response?.id,

                                    }
                                }
                            },

                        ]
                    },
                    select: {
                        email: true
                    }
                }).then(clients => new Set(clients.map(c => c.email.toLowerCase())).size),
                // Total Employees
                prisma.user.count({
                    where: {
                        company_id: valid.response?.id,
                        isDisabled: false,
                        office: {
                            name: "Worker"
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // In Progress Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "In Progress",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // Pending Estimates
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "Waiting for Decision",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                // Completed Projects
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "Finished",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                })
            ]);

            return res.json({
                estimates,
                projects,
                customers: Number(customers),
                employees,
                inProgressProjects,
                pendingEstimates,
                completedProjects
            });
        } catch (error) {
            console.error("Error in dashboardCards:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async salesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const projects = await prisma.project.findMany({
                where: {
                    company_id: valid.response?.id,
                    status_project: {
                        in: ["Accepted", "Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                select: {
                    date_creation: true,
                    price: true
                }
            });

            const salesByMonth = projects.reduce<Record<string, number>>((acc, project) => {
                const monthYear = dayjs(project.date_creation).format('MMM YYYY');
                acc[monthYear] = (acc[monthYear] || 0) + Number(project.price || 0);
                return acc;
            }, {});

            const salesData = Object.entries(salesByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, value]) => ({
                    month,
                    value: Number(value.toFixed(2))
                }));

            return res.json(salesData);
        } catch (error) {
            console.error("Error in salesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async expensesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const expenses = await prisma.costProject.findMany({
                where: {
                    ServiceProject: {
                        Project: {
                            company_id: valid.response?.id
                        }
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                select: {
                    price: true,
                    date_creation: true
                }
            });

            const expensesByMonth = expenses.reduce<Record<string, number>>((acc, expense) => {
                const monthYear = dayjs(expense.date_creation).format('MMM YYYY');
                acc[monthYear] = (acc[monthYear] || 0) + Number(expense.price || 0);
                return acc;
            }, {});

            const expensesData = Object.entries(expensesByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, value]) => ({
                    month,
                    value: Number(value.toFixed(2))
                }));

            return res.json(expensesData);
        } catch (error) {
            console.error("Error in expensesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }
    async expenses(req: Request, res: Response) {
        const valid = await validCompany(req);
        if (valid.status === 'error') {
            return res.status(404).json({ error: valid.message });
        }

        const { period = "thisYear" } = req.query;

        const validPeriods = [
            "thisYear",
            "thisQuarter",
            "last3Months",
            "lastMonth",
            "thisMonth",
            "last30Days",
            "allPeriod"
        ];

        if (!validPeriods.includes(period as string)) {
            return res.status(400).json({
                error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
            });
        }

        const { startDate, endDate } = getDateRange(period as string);

        const dateFilter: any = { gte: startDate };
        if (endDate) {
            dateFilter.lte = endDate;
        }
        try {
            const costProject = await prisma.costProject.findMany({
                select: {
                    price: true,
                    material_name: true,
                },
                where: {
                    ServiceProject: {
                        Project: {
                            company_id: valid.response?.id
                        }
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
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
                            company_id: valid.response?.id,
                        },
                        Object.keys(dateFilter).length > 0 ? {
                            date_creation: dateFilter
                        } : {}
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
                    workedHours: {
                        select: {
                            id: true,
                            project_id: true,
                            name_user: true,
                            amount_of_hours: true,
                            hourly_price: true,
                            date_creation: true,
                            start_date: true,
                            end_date: true
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
                                                    hourly_price: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                    }
                },
            })
            // Formatar e calcular horas trabalhadas
            const formattedResult = projects.flatMap(i => i.serviceProject
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
                            let regularHours = 0;
                            let overtimeHours = 0;

                            if (x.check_out_time && x.check_in_time) {
                                const hours = calcularHorasTrabalhadas(
                                    x.check_in_time.toISOString(),
                                    x.check_out_time.toISOString(),
                                    x.workStartTime,
                                    x.workEndTime,
                                );
                                regularHours = convertHHMMToDecimal(hours.normais);
                                overtimeHours = convertHHMMToDecimal(hours.extras);
                            }

                            const calculatedPrice = x.user.hourly_price
                                ? (regularHours * x.user.hourly_price) + (overtimeHours * x.user.hourly_price * 1.5)
                                : 0;
                            return ({
                                ...x,
                                hours_worked: roundedHours,
                                price: calculatedPrice
                            })
                        })
                    )
                )
            );

            // Formatar e calcular horas trabalhadas
            const workerCost = projects.flatMap(i => i.workedHours.map(item => {
                return ({
                    id: item.id,
                    price: item.amount_of_hours !== null
                        ? Number(item.amount_of_hours) * Number(item.hourly_price)
                        : Number(item.hourly_price)
                })
            }));
            // Dicionário para armazenar os totais por categoria
            const costProjectTotal = parseFloat(
                costProject
                    .reduce((sum, expense) => sum + Number(expense.price), 0)
                    .toFixed(2) // Fixa em 2 casas decimais
            );

            const formattedResultTotal = parseFloat(
                formattedResult
                    .reduce((acc, i) => acc + (i.price || 0), 0)
                    .toFixed(2)
            );

            const workerCostTotal = parseFloat(
                workerCost
                    .reduce((sum, expense) => sum + Number(expense.price), 0)
                    .toFixed(2)
            );
            const costWorkerTotal = parseFloat(
                (formattedResultTotal + workerCostTotal).toFixed(2)
            );
            // Converte o objeto para um array no formato desejado
            const formattedExpenses = [{
                label: 'Material cost',
                value: costProjectTotal,
                color: "#017E76",
            }, {
                label: 'Employee cost',
                value: costWorkerTotal,
                color: "#00DBD5",
            }
            ];

            return res.json(formattedExpenses);
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async cashflowChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const [invoices, expenses] = await Promise.all([
                prisma.invoice.findMany({
                    where: {
                        companyId: valid.response?.id,
                        status: 'PAID',
                        ...(Object.keys(dateFilter).length > 0 && {
                            createdAt: dateFilter
                        })
                    },
                    select: {
                        totalAmount: true,
                        createdAt: true,
                        id: true
                    }
                }),
                prisma.costProject.findMany({
                    where: {
                        ServiceProject: {
                            Project: {
                                company_id: valid.response?.id
                            }
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    },
                    select: {
                        price: true,
                        date_creation: true
                    }
                })
            ]);

            const cashflowByMonth: Record<string, { income: number; expenses: number; invoiceIds: string[] }> = {};

            // Process income
            invoices.forEach(invoice => {
                const monthYear = dayjs(invoice.createdAt).format('MMM YYYY');
                if (!cashflowByMonth[monthYear]) {
                    cashflowByMonth[monthYear] = { income: 0, expenses: 0, invoiceIds: [] };
                }
                cashflowByMonth[monthYear].income += Number(invoice.totalAmount || 0);
                cashflowByMonth[monthYear].invoiceIds.push(invoice.id);
            });

            // Process expenses
            expenses.forEach(expense => {
                const monthYear = dayjs(expense.date_creation).format('MMM YYYY');
                if (!cashflowByMonth[monthYear]) {
                    cashflowByMonth[monthYear] = { income: 0, expenses: 0, invoiceIds: [] };
                }
                cashflowByMonth[monthYear].expenses += Number(expense.price || 0);
            });

            const cashflowData = Object.entries(cashflowByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, data]) => ({
                    month,
                    income: Number(data.income.toFixed(2)),
                    expenses: Number(data.expenses.toFixed(2)),
                    invoiceIds: data.invoiceIds
                }));

            return res.json(cashflowData);
        } catch (error) {
            console.error("Error in cashflowChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async invoicesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const now = new Date();
            const invoices = await prisma.invoice.findMany({
                where: {
                    companyId: valid.response?.id,
                    ...(Object.keys(dateFilter).length > 0 && {
                        createdAt: dateFilter
                    })
                },
                select: {
                    totalAmount: true,
                    status: true,
                    dueDate: true,
                    createdAt: true
                }
            });

            const invoicesByMonth = invoices.reduce<Record<string, { paid: number; notDueYet: number; overdue: number }>>(
                (acc, invoice) => {
                    const monthYear = dayjs(invoice.createdAt).format('MMM YYYY');
                    if (!acc[monthYear]) {
                        acc[monthYear] = { paid: 0, notDueYet: 0, overdue: 0 };
                    }

                    const amount = Number(invoice.totalAmount || 0);
                    if (invoice.status === 'PAID') {
                        acc[monthYear].paid += amount;
                    } else if (invoice.dueDate && new Date(invoice.dueDate) < now) {
                        acc[monthYear].overdue += amount;
                    } else {
                        acc[monthYear].notDueYet += amount;
                    }

                    return acc;
                },
                {}
            );

            const invoicesData = Object.entries(invoicesByMonth)
                .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
                .map(([month, data]) => ({
                    month,
                    paid: Number(data.paid.toFixed(2)),
                    notDueYet: Number(data.notDueYet.toFixed(2)),
                    overdue: Number(data.overdue.toFixed(2))
                }));

            return res.json(invoicesData);
        } catch (error) {
            console.error("Error in invoicesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async projectsChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const projects = await prisma.project.groupBy({
                by: ['status_project'],
                where: {
                    company_id: valid.response?.id,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                _count: true
            });

            const total = projects.reduce((sum, p) => sum + p._count, 0);
            const chartData = projects.map(p => ({
                label: p.status_project,
                value: p._count,
                percentage: (p._count / total) * 100
            }));

            return res.json(chartData);
        } catch (error) {
            console.error("Error in projectsChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    async estimatesChart(req: Request, res: Response) {
        try {
            const valid = await validCompany(req);
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const { period = "thisYear" } = req.query;

            const validPeriods = [
                "thisYear",
                "thisQuarter",
                "last3Months",
                "lastMonth",
                "thisMonth",
                "last30Days",
                "allPeriod"
            ];

            if (!validPeriods.includes(period as string)) {
                return res.status(400).json({
                    error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
                });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = { gte: startDate };
            if (endDate) {
                dateFilter.lte = endDate;
            }

            const [pendingEstimates, acceptedEstimates, deniedEstimates] = await Promise.all([

                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: {
                            in: ["Waiting for Decision", "Pending"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: {
                            in: ["Accepted", "Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                        },
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                prisma.project.count({
                    where: {
                        company_id: valid.response?.id,
                        status_project: "Denied",
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                })
            ]);

            const chartData = [
                { label: "Pending", value: pendingEstimates },
                { label: "Accepted", value: acceptedEstimates },
                { label: "Denied", value: deniedEstimates }
            ];

            return res.json(chartData);
        } catch (error) {
            console.error("Error in estimatesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }
} 