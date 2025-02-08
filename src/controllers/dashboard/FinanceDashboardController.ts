
import  { Response } from 'express';
import { prisma } from '../../utils/prisma';

export class FinanceDashboardController{
    async cashflow( res: Response) {
        try {
            const invoices = await prisma.invoice.findMany({
                select: {
                    totalAmount: true,
                    createdAt: true,
                },
            });

            const cashflow = invoices.reduce<Record<string, number>>((acc, invoice) => {
                const month = new Date(invoice.createdAt).toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + Number(invoice.totalAmount);
                return acc;
            }, {});

            res.json(cashflow);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
    async expenses(res: Response) {
        try {
            const expenses = await prisma.costProject.findMany({
                select: {
                    price: true,
                    material_name: true,
                },
            });

            const formattedExpenses = expenses.map(exp => ({
                category: exp.material_name,
                amount: Number(exp.price),
            }));

            res.json(formattedExpenses);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
    async profitLoss(res: Response) {
        try {
            const totalIncome = await prisma.invoice.aggregate({ _sum: { totalAmount: true } });
            const totalExpenses = await prisma.costProject.aggregate({ _sum: { price: true } });

            res.json({
                income: totalIncome._sum.totalAmount || 0,
                expenses: totalExpenses._sum.price || 0,
                profit: Number(totalIncome._sum.totalAmount || 0) - Number(totalExpenses._sum.price || 0),
            });
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
    async sales(res: Response) {
        try {
            const sales = await prisma.project.findMany({
                select: {
                    price: true,
                    date_creation: true,
                },
            });

            const salesByQuarter = sales.reduce<Record<string, number>>((acc, sale) => {
                const month = new Date(sale.date_creation).getMonth() + 1;
                const quarter = `Q${Math.ceil(month / 3)}`;
                acc[quarter] = (acc[quarter] || 0) + Number(sale.price);
                return acc;
            }, {});

            res.json(salesByQuarter);
        } catch (error) {
            res.status(500).json({ error: (error as Error).message });
        }
    }
}


