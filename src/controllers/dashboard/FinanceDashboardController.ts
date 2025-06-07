import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { returnPayLoad } from '../../config/returnPayLoad';
import dayjs from 'dayjs';
import { calcularHorasTrabalhadas, convertHHMMToDecimal } from '../../utils/calculaHoraExtra';


async function validCompany(request: Request) {
    const authHeader = returnPayLoad(request)
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
        const valid = await validCompany(req);
        if (valid.status == 'error') {
            return res.status(404).json({ error: valid.message });
        }
        try {
            // 1. Buscar faturas (income)
            const invoices = await prisma.invoice.findMany({
                where: {
                    companyId: valid.response?.id
                },
            });

            // 2. Buscar custos de materiais
            const costProjects = await prisma.costProject.findMany({
                where: {
                    ServiceProject: {
                        Project: {
                            company_id: valid.response?.id
                        }
                    }
                },
                select: {
                    price: true,
                    date_creation: true,
                    ServiceProject: {
                        select: {
                            Project: {
                                select: {
                                    date_creation: true
                                }
                            }
                        }
                    }
                }
            });

            // 3. Buscar projetos para calcular custos com funcionários
            const projects = await prisma.project.findMany({
                where: {
                    company_id: valid.response?.id,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"],
                    }
                },
                include: {
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
                            UserServiceProject: {
                                select: {
                                    user_attendances: {
                                        include: {
                                            user: {
                                                select: {
                                                    hourly_price: true
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });

            // 4. Calcular custos com funcionários por mês/ano (agora incluindo workedHours)
            const employeeCostsByMonth = projects.flatMap(project => {
                // Custos de user_attendances
                const attendanceCosts = project.serviceProject.flatMap(sp =>
                    sp.UserServiceProject.flatMap(usp =>
                        usp.user_attendances.map(attendance => {
                            // const hoursWorked = attendance.check_in_time && attendance.check_out_time
                            //     ? dayjs(attendance.check_out_time).diff(
                            //         dayjs(attendance.check_in_time),
                            //         "hour",
                            //         true
                            //     )
                            //     : 0;

                            let regularHours = 0;
                            let overtimeHours = 0;

                            if (attendance.check_out_time && attendance.check_in_time) {
                                const hours = calcularHorasTrabalhadas(
                                    attendance.check_in_time.toISOString(),
                                    attendance.check_out_time.toISOString(),
                                    attendance.workStartTime,
                                    attendance.workEndTime,
                                );
                                regularHours = convertHHMMToDecimal(hours.normais);
                                overtimeHours = convertHHMMToDecimal(hours.extras);
                            }

                            const calculatedPrice = attendance.user.hourly_price
                                ? (regularHours * attendance.user.hourly_price) + (overtimeHours * attendance.user.hourly_price * 1.5)
                                : 0;
                            
                            return {
                                cost: calculatedPrice,
                                date: attendance.check_in_time
                            };
                        })
                    )
                );

                // Custos de workedHours
                const workedHoursCosts = project.workedHours.map(item => {
                    const cost = item.amount_of_hours !== null
                        ? Number(item.amount_of_hours) * Number(item.hourly_price)
                        : Number(item.hourly_price)
                    return {
                        cost,
                        date: item.date_creation // Usamos a data de criação do registro
                    };
                });

                return [...attendanceCosts, ...workedHoursCosts];
            }).reduce<Record<string, number>>((acc, { cost, date }) => {
                if (!date) return acc;
                const monthYear = dayjs(date).format('MMM YYYY');
                acc[monthYear] = (acc[monthYear] || 0) + cost;
                return acc;
            }, {});

            // 5. Calcular custos de materiais por mês/ano
            const materialCostsByMonth = costProjects.reduce<Record<string, number>>((acc, project) => {
                const date = project.date_creation;
                const monthYear = dayjs(date).format('MMM YYYY');
                acc[monthYear] = Number(Number((acc[monthYear] || 0) + Number(project.price)).toFixed(2));
                return acc;
            }, {});

            // 6. Combinar todos os custos (materiais + funcionários)
            const combinedExpensesByMonth = Object.entries(materialCostsByMonth).reduce(
                (acc, [monthYear, amount]) => {
                    acc[monthYear] = Number(Number((acc[monthYear] || 0) + amount).toFixed(2));
                    return acc;
                },
                { ...employeeCostsByMonth }
            );

            // 7. Calcular income por mês/ano
            const incomeByMonth = invoices.reduce<Record<string, number>>((acc, invoice) => {
                const monthYear = dayjs(invoice.createdAt).format('MMM YYYY');
                acc[monthYear] = Number(Number((acc[monthYear] || 0) + Number(invoice.totalAmount)).toFixed(2));
                return (acc);
            }, {});

            // 8. Juntar todos os meses únicos e ordenar
            const allMonths = Array.from(
                new Set([...Object.keys(incomeByMonth), ...Object.keys(combinedExpensesByMonth)])
            ).sort((a, b) =>
                dayjs(a, 'MMM YYYY').valueOf() - dayjs(b, 'MMM YYYY').valueOf()
            );

            // 9. Formatar resposta final
            const cashflow = allMonths.map(monthYear => ({
                month: monthYear,
                income: (incomeByMonth[monthYear]) || 0,
                expense: (combinedExpensesByMonth[monthYear]) || 0,
            }));

            res.json(cashflow);
        } catch (error) {
            console.error("Error in cashflow:", error);
            return res.status(500).json({ error: error instanceof Error ? error.message : "Internal server error" });
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
    async project(req: Request, res: Response) {
        const valid = await validCompany(req)
        if (valid.status == 'error') {
            return res.status(404).json({ error: valid.message });
        }


        try {
            const countProject = await prisma.project.count({
                where: {
                    AND: [
                        {
                            status_project: {
                                in: ["Finished"],
                            },
                        },
                        {
                            company_id: valid.response?.id,
                        },
                    ]
                },
            })
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
                                in: ["Finished"],
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
            const costProjectTotal = costProject.reduce((sum, expense) => sum + Number(expense.price), 0);
            const costWorkerTotal = Number(formattedResult.reduce((acc, i) => acc + (i.price || 0), 0) + (workerCost.reduce((sum, expense) => sum + Number(expense.price), 0)))
            const profit = Number(costProjectTotal + costWorkerTotal).toFixed(2)

            return res.json({
                countProject,
                profit: Number(profit),
                cost: Number(costWorkerTotal.toFixed(2))
            })
        } catch (error) {
            console.error("Error in project:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
    async sales(req: Request, res: Response) {
        try {
            const valid = await validCompany(req)
            if (valid.status == 'error') {
                return res.status(404).json({ error: valid.message });
            }
            // 1. Buscar faturas (income)
            const sales = await prisma.invoice.findMany({
                where: {
                    companyId: valid.response?.id
                },
                select: {
                    totalAmount: true,
                    createdAt: true,
                },
            });
            const profit = sales.reduce((sum, data) => sum + Number(data.totalAmount), 0)

            // Dicionário para armazenar as vendas por trimestre
            const salesByQuarter = sales.reduce<Record<string, number>>((acc, sale) => {
                const month = new Date(sale.createdAt).getMonth() + 1;
                const quarter = `Q${Math.ceil(month / 3)}`;
                acc[quarter] = (acc[quarter] || 0) + Number(sale.totalAmount);
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

            return res.json({ profit, sales: formattedSalesData });
        } catch (error) {
            console.error("Error in findMany:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }
    async indicators(req: Request, res: Response) {
        try {
            const valid = await validCompany(req)
            if (valid.status === 'error') {
                return res.status(404).json({ error: valid.message });
            }

            const companyId = valid.response?.id;

            // Contagem de funcionários ativos (isDisabled = false) e com cargo "Worker"
            const employeesCount = await prisma.user.count({
                where: {
                    company_id: companyId,
                    isDisabled: false, // Filtrar apenas usuários ativos
                    office: {
                        name: {
                            equals: 'Worker'
                        }
                    }
                }
            });

            const [
                estimates,
                projects,
                inProgressProjects,
                pendingProjects,
                completedProjects,
                canceledProjects
            ] = await Promise.all([
                prisma.project.count({
                    where: {
                        status_project: {
                            in: ["Pending", "Accepted", "Denied", "Waiting for Decision"]
                        },
                        company_id: companyId
                    }
                }),
                prisma.project.count({
                    where: {
                        status_project: {
                            notIn: ["Pending", "Accepted", "Denied", "Waiting for Decision"]
                        },
                        company_id: companyId
                    }
                }),
                prisma.project.count({
                    where: {
                        status_project: {
                            equals: "In Progress"
                        },
                        company_id: companyId
                    }
                }),
                prisma.project.count({
                    where: {
                        status_project: {
                            equals: "Waiting for Decision"
                        },
                        company_id: companyId
                    }
                }),
                prisma.project.count({
                    where: {
                        status_project: {
                            equals: "Finished"
                        },
                        company_id: companyId
                    }
                }),
                prisma.project.count({
                    where: {
                        status_project: {
                            equals: "Canceled"
                        },
                        company_id: companyId
                    }
                })
            ]);

            return res.json({
                estimates,
                projects,
                employees: employeesCount,
                customers: 0,
                inProgressProjects,
                pendingProjects,
                completedProjects,
                canceledProjects
            });
        } catch (error) {
            console.error("Error in indicators:", error);

            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }

            return res.status(500).json({ error: "Internal server error" });
        }
    }

}


