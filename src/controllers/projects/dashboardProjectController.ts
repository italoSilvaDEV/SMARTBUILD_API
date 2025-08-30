import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DashboardProjectController {
    async handle(req: Request, res: Response) {
        const { companyId } = req.params;
        const { period = "thisYear", status_project } = req.query;

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
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
            "Waiting for Decision",
            "Denied",
            "Canceled",
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

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        });

        if (!company) {
            return res.status(404).json({
                error: "Company not found"
            });
        }

        try {
            const getDateRange = (periodType: string) => {
                const now = new Date();
                let startDate: Date;
                let monthsToShow = 12;

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
                        const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
                        monthsToShow = 1;
                        return { startDate, endDate, monthsToShow };

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

                return { startDate, endDate: undefined, monthsToShow };
            };

            const { startDate, endDate, monthsToShow } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const shouldFilterByStatus = statusFilters.length > 0;

            const totalSalesEstimatesResult = await prisma.estimate.aggregate({
                where: {
                    project: {
                        company_id: companyId,
                    },
                    status: "approved",
                    type_estimate: "estimate",
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                _sum: {
                    totalAmount: true
                }
            });

            const totalSalesProjectsResult = await prisma.project.aggregate({
                where: {
                    company_id: companyId,
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    }),
                    ...(shouldFilterByStatus && {
                        status_project: {
                            in: statusFilters
                        }
                    })
                },
                _sum: {
                    price: true
                }
            });

            const totalSalesEstimates = totalSalesEstimatesResult._sum.totalAmount || 0;
            const totalSalesProjects = totalSalesProjectsResult._sum.price || 0;
            const totalSales = Number(totalSalesEstimates) + Number(totalSalesProjects);

            const averageValueResult = await prisma.project.aggregate({
                where: {
                    company_id: companyId,
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    }),
                    ...(shouldFilterByStatus && {
                        status_project: {
                            in: statusFilters
                        }
                    })
                },
                _avg: {
                    price: true
                }
            });

            const averageValue = averageValueResult._avg.price || 0;

            const totalEstimates = await prisma.estimate.count({
                where: {
                    project: {
                        company_id: companyId,
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter,
                    })
                }
            });

            const approvedEstimates = await prisma.estimate.count({
                where: {
                    project: {
                        company_id: companyId,
                    },
                    status: "approved",
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                }
            });

            const conversionRate = totalEstimates > 0
                ? ((approvedEstimates / totalEstimates) * 100)
                : 0;

            const estimatesForChart = await prisma.estimate.findMany({
                where: {
                    project: {
                        company_id: companyId,
                    },
                    status: {
                        in: ["approved"]
                    },
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                select: {
                    totalAmount: true,
                    date_creation: true
                }
            });

            const projectsForChart = await prisma.project.findMany({
                where: {
                    company_id: companyId,
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    }),
                    ...(shouldFilterByStatus && {
                        status_project: {
                            in: statusFilters
                        }
                    })
                },
                select: {
                    price: true,
                    date_creation: true
                }
            });

            const monthlyData: { [key: string]: number } = {};
            const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

            estimatesForChart.forEach(estimate => {
                const date = new Date(estimate.date_creation);
                const monthKey = `${monthNames[date.getMonth()]}/${date.getFullYear()}`;
                const amount = Number(estimate.totalAmount) || 0;

                monthlyData[monthKey] = (monthlyData[monthKey] || 0) + amount;
            });

            projectsForChart.forEach(project => {
                const date = new Date(project.date_creation);
                const monthKey = `${monthNames[date.getMonth()]}/${date.getFullYear()}`;
                const amount = Number(project.price) || 0;

                monthlyData[monthKey] = (monthlyData[monthKey] || 0) + amount;
            });

            const monthlySales = [];
            const currentDate = new Date();

            if (period === "last30Days") {
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
                totalSales: Number(totalSales),
                averageValue: Number(averageValue),
                conversionRate: Number(conversionRate.toFixed(2)),
                monthlySales: monthlySales,
                period: period,
                dateRange: {
                    startDate: startDate.toISOString(),
                    endDate: endDate?.toISOString() || new Date().toISOString()
                }
            });

        } catch (error) {
            console.error("Error fetching dashboard metrics:", error);
            return res.status(500).json({
                error: "Internal server error while fetching dashboard metrics"
            });
        }
    }
}