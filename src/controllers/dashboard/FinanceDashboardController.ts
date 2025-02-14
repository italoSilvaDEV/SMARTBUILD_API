
import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { decodeToken } from '../../config/decodeToken';
import { returnPayLoad } from '../../config/returnPayLoad';
import dayjs from 'dayjs';


async function validCompany(request: Request) {
    const authHeader = returnPayLoad(request)
    console.log(authHeader)
    if (authHeader == null) return {
        status: 'error',
        message: 'Token not found'
    };
    const user = await prisma.user.findUnique({
        where: {
            id: authHeader.id
        }
    })
    if (!user) return {
        status: 'error',
        message: 'User not found'
    };
    const response = await prisma.company.findUnique({
        where: {
            id: String(user.company_id)
        }
    })
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

        const valid = await validCompany(req)
        if (valid.status == 'error') {
            return res.status(404).json({ error: valid.message });
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
                    }
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
                            const calculatedPrice = x.user.hourly_price
                                ? x.user.hourly_price * roundedHours
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
            // Dicionário para armazenar os totais por categoria
            const costProjectTotal = costProject.reduce((sum, expense) => sum + Number(expense.price), 0);
            const costWorkerTotal = parseFloat(formattedResult.reduce((acc, i) => acc + (i.price || 0), 0).toFixed(2))

            // Gera uma cor aleatória
            const generateRandomColor = () => {
                return `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;
            };

            // Converte o objeto para um array no formato desejado
            const formattedExpenses = [{
                label: 'Custo de material',
                value: costProjectTotal,
                color: "#017E76",
            }, {
                label: 'Custo de funcionario',
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


