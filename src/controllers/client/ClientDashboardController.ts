import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import dayjs from 'dayjs';

function getDateRange(periodType: string) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date | undefined;

    switch (periodType) {
        case 'thisYear':
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
            break;
        case 'thisQuarter':
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59);
            break;
        case 'last3Months':
            startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'lastMonth':
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            break;
        case 'thisMonth':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
            break;
        case 'last30Days':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            endDate = now;
            break;
        case 'allPeriod':
            startDate = new Date(2000, 0, 1);
            endDate = undefined;
            break;
        default:
            startDate = new Date(now.getFullYear(), 0, 1);
            endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    }

    return { startDate, endDate };
}

export class ClientDashboardController {
    // Gráfico: Projects Overview (por status)
    async projectsChart(req: Request, res: Response) {
        try {
            const { clientId } = req.params;
            const { company_id, period = "thisYear" } = req.query;

            if (!clientId || !company_id) {
                return res.status(400).json({ error: "Client ID and Company ID are required" });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            // Buscar projetos do cliente agrupados por status
            const projects = await prisma.project.findMany({
                where: {
                    client_id: clientId,
                    company_id: String(company_id),
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
                },
                select: {
                    status_project: true,
                    price: true
                }
            });

            // Agrupar por status
            const statusCounts: { [key: string]: number } = {};
            projects.forEach(project => {
                const status = project.status_project || 'Unknown';
                statusCounts[status] = (statusCounts[status] || 0) + 1;
            });

            // Calcular total e percentagens
            const total = projects.length;
            const chartData = Object.entries(statusCounts).map(([label, value]) => ({
                label,
                value,
                percentage: total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0
            }));

            return res.json(chartData);
        } catch (error) {
            // console.error("Error in projectsChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    // Gráfico: Estimates Status
    async estimatesChart(req: Request, res: Response) {
        try {
            const { clientId } = req.params;
            const { company_id, period = "thisYear" } = req.query;

            if (!clientId || !company_id) {
                return res.status(400).json({ error: "Client ID and Company ID are required" });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            // Buscar estimates do cliente através dos projetos
            const [pendingEstimates, approvedEstimates, canceledEstimates] = await Promise.all([
                prisma.estimate.count({
                    where: {
                        project: {
                            client_id: clientId,
                            company_id: String(company_id)
                        },
                        status: 'pending',
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                prisma.estimate.count({
                    where: {
                        project: {
                            client_id: clientId,
                            company_id: String(company_id)
                        },
                        status: 'approved',
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                }),
                prisma.estimate.count({
                    where: {
                        project: {
                            client_id: clientId,
                            company_id: String(company_id)
                        },
                        status: 'canceled',
                        ...(Object.keys(dateFilter).length > 0 && {
                            date_creation: dateFilter
                        })
                    }
                })
            ]);

            return res.json([
                { label: 'Pending', value: pendingEstimates },
                { label: 'Accepted', value: approvedEstimates },
                { label: 'Denied', value: canceledEstimates }
            ]);
        } catch (error) {
            // console.error("Error in estimatesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }

    // Gráfico: Invoices Overview
    async invoicesChart(req: Request, res: Response) {
        try {
            const { clientId } = req.params;
            const { company_id, period = "thisYear" } = req.query;

            if (!clientId || !company_id) {
                return res.status(400).json({ error: "Client ID and Company ID are required" });
            }

            const { startDate, endDate } = getDateRange(period as string);

            const dateFilter: any = {};
            if (period !== "allPeriod") {
                dateFilter.gte = startDate;
                if (endDate) {
                    dateFilter.lte = endDate;
                }
            }

            const now = new Date();

            // Buscar invoices do cliente através dos projetos
            const invoices = await prisma.invoice.findMany({
                where: {
                    project: {
                        client_id: clientId,
                        company_id: String(company_id)
                    },
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
                    if (invoice.status === 'paid') {
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
            // console.error("Error in invoicesChart:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
        }
    }
}

