
import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class FinanceDashboardController {
    async cashflow(req: Request, res: Response) {
        try {
            const invoices = await prisma.invoice.findMany();

            const cashflow = invoices.reduce<Record<string, number>>((acc, invoice) => {
                const month = new Date(invoice.createdAt).toLocaleString('default', { month: 'short' });
                acc[month] = (acc[month] || 0) + Number(invoice.totalAmount);
                return acc;
            }, {});

            res.json(cashflow);
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
    async expenses(req: Request, res: Response) {
        try {
            const expenses = await prisma.costProject.findMany({
                select: {
                    price: true,
                    material_name: true,
                },
            });

            // Dicionário para armazenar os totais por categoria
            const expenseMap = expenses.reduce<Record<string, number>>((acc, exp) => {
                const category = exp.material_name || "Other"; // Garante que não tenha categoria vazia
                acc[category] = (acc[category] || 0) + Number(exp.price);
                return acc;
            }, {});

            // Gera uma cor aleatória
            const generateRandomColor = () => {
                return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
            };

            // Converte o objeto para um array no formato desejado
            const formattedExpenses = Object.entries(expenseMap).map(([label, value]) => ({
                label,
                value,
                color: generateRandomColor(),
            }));

            return res.json(formattedExpenses);
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async profitLoss(req: Request, res: Response) {
        try {
            const totalIncome = await prisma.invoice.aggregate({ _sum: { totalAmount: true } });
            const totalExpenses = await prisma.costProject.aggregate({ _sum: { price: true } });

            res.json({
                income: totalIncome._sum.totalAmount || 0,
                expenses: totalExpenses._sum.price || 0,
                profit: Number(totalIncome._sum.totalAmount || 0) - Number(totalExpenses._sum.price || 0),
            });
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
    async sales(req: Request, res: Response) {
        try {
            const sales = await prisma.project.findMany({
                select: {
                    price: true,
                    date_creation: true,
                },
            });

            // Dicionário para armazenar as vendas por trimestre
            const salesByQuarter = sales.reduce<Record<string, number>>((acc, sale) => {
                const month = new Date(sale.date_creation).getMonth() + 1;
                const quarter = `Q${Math.ceil(month / 3)}`;
                acc[quarter] = (acc[quarter] || 0) + Number(sale.price);
                return acc;
            }, {});

            // Converte para o formato desejado
            const salesData = Object.entries(salesByQuarter).map(([quarter, value]) => ({
                quarter,
                value: Number(value.toFixed(2)), // Garante duas casas decimais
            }));

            // Garante que todos os trimestres (Q1-Q4) estejam presentes com valor 0 se não houver vendas
            const allQuarters = ["Q1", "Q2", "Q3", "Q4", "Q5"];
            const formattedSalesData = allQuarters.map(q => ({
                quarter: q,
                value: salesData.find(s => s.quarter === q)?.value || 0,
            }));

            return res.json(formattedSalesData);
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
}


