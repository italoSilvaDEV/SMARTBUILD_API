import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import dayjs from "dayjs";

export class DashboardSubcontractorController {
    async handle(req: Request, res: Response) {
        const { subcontractorId } = req.params;
        const { period = "thisYear", status_project, startDate: queryStartDate, endDate: queryEndDate } = req.query;

        if (!subcontractorId) {
            return res.status(400).json({
                error: "Subcontractor ID is required"
            });
        }

        const validPeriods = [
            "thisYear",
            "thisQuarter",
            "last3Months",
            "lastMonth",
            "thisMonth",
            "last30Days",
            "allPeriod"
        ];

        const validStatusProjects = [
            "Pre-Start",
            "In Progress",
            "Final walkthrough",
            "Finished",
        ];

        if (!validPeriods.includes(period as string)) {
            return res.status(400).json({
                error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
            });
        }

        let statusFilters: string[] = [];
        if (status_project) {
            const statusArray = (status_project as string).split(',').map(s => s.trim());

            for (const status of statusArray) {
                if (!validStatusProjects.includes(status)) {
                    return res.status(400).json({
                        error: `Invalid status_project '${status}'. Valid values are: ${validStatusProjects.join(", ")}`
                    });
                }
            }
            statusFilters = statusArray;
        }

        try {
            const getDateRange = (periodType: string) => {
                const now = new Date();
                let startDate: Date;
                let endDate: Date | undefined;
                let monthsToShow = 12;

                if (queryStartDate && queryEndDate) {
                    startDate = dayjs(queryStartDate as string).toDate();
                    endDate = dayjs(queryEndDate as string).toDate();
                    
                    const diffMonths = dayjs(endDate).diff(dayjs(startDate), 'month') + 1;
                    monthsToShow = Math.min(diffMonths, 24);
                    
                    return { startDate, endDate, monthsToShow, isCustom: true };
                }

                switch (periodType) {
                    case "thisYear":
                        startDate = new Date(now.getFullYear(), 0, 1);
                        monthsToShow = now.getMonth() + 1;
                        break;

                    case "thisQuarter":
                        const currentQuarter = Math.floor(now.getMonth() / 3);
                        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
                        monthsToShow = 3;
                        break;

                    case "last3Months":
                        startDate = new Date();
                        startDate.setMonth(now.getMonth() - 3);
                        monthsToShow = 3;
                        break;

                    case "lastMonth":
                        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                        monthsToShow = 1;
                        return { startDate, endDate, monthsToShow, isCustom: false };

                    case "thisMonth":
                        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                        monthsToShow = 1;
                        break;

                    case "last30Days":
                        startDate = new Date();
                        startDate.setDate(now.getDate() - 30);
                        monthsToShow = 2;
                        break;

                    case "allPeriod":
                        startDate = new Date(2020, 0, 1);
                        monthsToShow = 12;
                        break;

                    default:
                        startDate = new Date(now.getFullYear(), 0, 1);
                        monthsToShow = 12;
                }

                return { startDate, endDate: undefined, monthsToShow, isCustom: false };
            };

            const { startDate, endDate, monthsToShow, isCustom } = getDateRange(period as string);

            const dateFilter: any = {};
            if (isCustom || period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const shouldFilterByStatus = statusFilters.length > 0;

            // Primeiro, busca todos os projetos do subcontractor COM filtro de status (fixed, hourly ou legado null)
            const allWorkedHours = await prisma.workedhours.findMany({
                where: {
                    subcontractor_id: subcontractorId,
                    OR: [
                        { type_price: "fixed" },
                        { type_price: "hourly" },
                        { AND: [{ type_price: null }, { amount_of_hours: null }] }
                    ]
                },
                select: {
                    project_id: true,
                },
                distinct: ['project_id'],
            });

            const allProjectIds = allWorkedHours.map((record: any) => record.project_id).filter(Boolean);

            if (allProjectIds.length === 0) {
                return res.status(200).json({
                    totalSubcontractorCosts: 0,
                    totalProjects: 0,
                    averageSubcontractorCost: 0,
                    monthlySales: [],
                    period: period,
                    dateRange: {
                        startDate: startDate.toISOString(),
                        endDate: endDate?.toISOString() || new Date().toISOString()
                    }
                });
            }

            // Filtro de data vale só para o gráfico de linha (data do pagamento do subcontractor em workedhours).
            // Filtro de status: quais projetos entram (não filtramos projeto por data de criação).
            const filteredProjects = await prisma.project.findMany({
                where: {
                    id: { in: allProjectIds },
                    ...(shouldFilterByStatus && {
                        status_project: {
                            in: statusFilters
                        }
                    })
                },
                select: {
                    id: true,
                }
            });

            const projectIds = filteredProjects.map(p => p.id);

            if (projectIds.length === 0) {
                return res.status(200).json({
                    totalSubcontractorCosts: 0,
                    totalProjects: 0,
                    averageSubcontractorCost: 0,
                    monthlySales: [],
                    period: period,
                    dateRange: {
                        startDate: startDate.toISOString(),
                        endDate: endDate?.toISOString() || new Date().toISOString()
                    }
                });
            }

            // Agora busca os workedHours APENAS dos projetos filtrados (fixed, hourly ou legado null)
            const workedHoursRecords = await prisma.workedhours.findMany({
                where: {
                    subcontractor_id: subcontractorId,
                    OR: [
                        { type_price: "fixed" },
                        { type_price: "hourly" },
                        { AND: [{ type_price: null }, { amount_of_hours: null }] }
                    ],
                    project_id: { in: projectIds },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                select: {
                    project_id: true,
                    hourly_price: true,
                    fixed_price: true,
                    amount_of_hours: true,
                    type_price: true,
                    date_creation: true,
                },
            });

            // Calcula custos do subcontractor por mês: fixed → fixed_price; hourly → amount_of_hours * hourly_price
            let totalSubcontractorCosts = 0;
            const monthlyData: { [key: string]: number } = {};
            const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

            for (const record of workedHoursRecords) {
                const date = new Date(record.date_creation);
                const monthKey = `${monthNames[date.getMonth()]}/${date.getFullYear()}`;
                let cost = 0;
                if (record.type_price === "fixed") {
                    cost = parseFloat((record.fixed_price as any)?.toString() || '0');
                } else if (record.type_price === "hourly") {
                    const hours = parseFloat((record.amount_of_hours as any)?.toString() || '0');
                    const hourlyRate = parseFloat((record.hourly_price as any)?.toString() || '0');
                    cost = hours > 0 ? hours * hourlyRate : hourlyRate;
                } else {
                    // legado: type_price null e amount_of_hours null → tratar como valor único em hourly_price
                    cost = parseFloat((record.hourly_price as any)?.toString() || '0');
                }

                totalSubcontractorCosts += cost;

                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = 0;
                }

                monthlyData[monthKey] += cost;
            }

            const averageSubcontractorCost = projectIds.length > 0 
                ? totalSubcontractorCosts / projectIds.length 
                : 0;

            // Prepara dados mensais para o gráfico (mesma lógica do dashboardProjectController)
            const monthlySales: { month: string; value: number }[] = [];
            const currentDate = new Date();

            if (isCustom) {
                let current = dayjs(startDate).startOf('month');
                const last = dayjs(endDate || new Date()).startOf('month');
                while (current.isBefore(last) || current.isSame(last)) {
                    const monthKey = `${monthNames[current.month()]}/${current.year()}`;
                    monthlySales.push({
                        month: monthKey,
                        value: monthlyData[monthKey] || 0
                    });
                    current = current.add(1, 'month');
                }
            } else if (period === "last30Days") {
                for (let i = 1; i >= 0; i--) {
                    const date = new Date();
                    date.setMonth(currentDate.getMonth() - i);
                    const monthKey = `${monthNames[date.getMonth()]}/${date.getFullYear()}`;
                    monthlySales.push({
                        month: monthKey,
                        value: monthlyData[monthKey] || 0
                    });
                }
            } else {
                // allPeriod = últimos 12 meses (startMonth 11); outros períodos = monthsToShow meses
                const startMonth = period === "allPeriod" ? 11 : monthsToShow - 1;
                for (let i = startMonth; i >= 0; i--) {
                    const date = new Date();
                    date.setMonth(currentDate.getMonth() - i);
                    const monthKey = `${monthNames[date.getMonth()]}/${date.getFullYear()}`;
                    monthlySales.push({
                        month: monthKey,
                        value: monthlyData[monthKey] || 0
                    });
                }
            }

            return res.status(200).json({
                totalSubcontractorCosts: Number(totalSubcontractorCosts),
                totalProjects: projectIds.length,
                averageSubcontractorCost: Number(averageSubcontractorCost),
                monthlySales: monthlySales,
                period: period,
                dateRange: {
                    startDate: startDate.toISOString(),
                    endDate: endDate?.toISOString() || new Date().toISOString()
                }
            });

        } catch (error) {
            console.error("Error fetching subcontractor dashboard metrics:", error);
            return res.status(500).json({
                error: "Internal server error while fetching subcontractor dashboard metrics"
            });
        }
    }
}
