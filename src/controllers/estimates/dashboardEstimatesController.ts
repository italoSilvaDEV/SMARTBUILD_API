import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DashboardEstimatesController {
    async handle(req: Request, res: Response) {
        const { company_id } = req.query;

        if (!company_id || typeof company_id !== 'string') {
            return res.status(400).json({
                error: "Company ID is required"
            });
        }

        try {
            const totalSalesResult = await prisma.estimate.aggregate({
                where: {
                    project: {
                        company_id: company_id
                    },
                    status: "approved"
                },
                _sum: {
                    totalAmount: true
                }
            });

            const totalSales = totalSalesResult._sum.totalAmount || 0;

            const averageValueResult = await prisma.estimate.aggregate({
                where: {
                    project: {
                        company_id: company_id
                    }
                },
                _avg: {
                    totalAmount: true
                }
            });

            const averageValue = averageValueResult._avg.totalAmount || 0;

            const totalEstimates = await prisma.estimate.count({
                where: {
                    project: {
                        company_id: company_id
                    }
                }
            });

            const approvedEstimates = await prisma.estimate.count({
                where: {
                    project: {
                        company_id: company_id
                    },
                    status: "approved"
                }
            });

            const conversionRate = totalEstimates > 0
                ? ((approvedEstimates / totalEstimates) * 100)
                : 0;

            const now = new Date();
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setFullYear(now.getFullYear() - 1);

            const estimatesForChart = await prisma.estimate.findMany({
                where: {
                    project: {
                        company_id: company_id
                    },
                    status: {
                        in: ["approved"]
                    },
                    date_creation: {
                        gte: twelveMonthsAgo
                    }
                },
                select: {
                    totalAmount: true,
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

            // Gerar array de dados mensais dos últimos 12 meses
            const monthlySales = [];
            const currentDate = new Date();

            for (let i = 11; i >= 0; i--) {
                const date = new Date();
                date.setMonth(currentDate.getMonth() - i);
                const monthKey = `${monthNames[date.getMonth()]}/${date.getFullYear()}`;

                monthlySales.push({
                    month: monthKey,
                    value: monthlyData[monthKey] || 0
                });
            }

            return res.status(200).json({
                totalSales: Number(totalSales),
                averageValue: Number(averageValue),
                conversionRate: Number(conversionRate.toFixed(2)),
                monthlySales: monthlySales
            });

        } catch (error) {
            console.error("Error fetching dashboard metrics:", error);
            return res.status(500).json({
                error: "Internal server error while fetching dashboard metrics"
            });
        }
    }
}