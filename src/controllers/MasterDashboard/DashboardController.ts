import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class DashboardController {
    async handle(request: Request, response: Response) {
        try {
            const { year } = request.query;
            const selectedYear = year ? parseInt(year as string) : new Date().getFullYear();

            // Buscar total de usuários clientes (usuários que têm empresa associada e office Administrator)
            const clients = await prisma.user.findMany({
                where: {
                    companies: {
                        some: {}
                    },
                    office: {
                        name: {
                            equals: "Administrator"
                        }
                    }
                },
                select: {
                    id: true,
                    companies: {
                        select: {
                            company: {
                                select: {
                                    name: true
                                }
                            }
                        }
                    }
                }
            })

            const activeProjects = await prisma.project.findMany({
                where: {
                    status_project: {
                        in: ["Accepted", "Pre-Start", "In Progress", "Final walkthrough"],
                    }
                }
            })

            const activePlans = await prisma.plan.findMany({
                where: {
                    subscriptions: {
                        some: {
                            isActive: true
                        }
                    }
                }
            })

            const permissionsGroups = await prisma.permissionGroup.findMany()

            // Buscar usuários clientes criados no ano especificado e calcular dados cumulativos
            const clientsData = await prisma.user.findMany({
                where: {
                    companies: {
                        some: {}
                    },
                    office: {
                        name: {
                            equals: "Administrator"
                        }
                    },
                    date_creation: {
                        gte: new Date(`${selectedYear}-01-01`),
                        lte: new Date(`${selectedYear}-12-31 23:59:59`)
                    }
                },
                select: {
                    date_creation: true
                },
                orderBy: {
                    date_creation: 'asc'
                }
            });

            // Buscar total de usuários clientes criados antes do ano selecionado
            const clientsBeforeYear = await prisma.user.count({
                where: {
                    company_id: {
                        not: null
                    },
                    office: {
                        name: {
                            equals: "Administrator"
                        }
                    },
                    date_creation: {
                        lt: new Date(`${selectedYear}-01-01`)
                    }
                }
            });

            // Calcular dados cumulativos por mês
            const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
            const cumulativeData = [];
            let runningTotal = clientsBeforeYear;

            for (let month = 0; month < 12; month++) {
                // Contar clientes criados neste mês
                const clientsThisMonth = clientsData.filter(client => {
                    const clientMonth = client.date_creation.getMonth();
                    return clientMonth === month;
                }).length;

                runningTotal += clientsThisMonth;

                cumulativeData.push({
                    month: monthNames[month],
                    total: runningTotal
                });
            }

            // Buscar os 5 clientes mais recentes
            const recentClients = await prisma.user.findMany({
                where: {
                    companies: {
                        some: {}
                    },
                    office: {
                        name: {
                            equals: "Administrator"
                        }
                    }
                },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    companies: {
                        select: {
                            company: {
                                select: {
                                    id: true,
                                    name: true,
                                    Project: {
                                        select: {
                                            id: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                },
                orderBy: {
                    date_creation: 'desc'
                },
                take: 5
            });

            // Formatar os dados dos clientes recentes
            const formattedRecentClients = await Promise.all(
                recentClients.map(async (client) => {
                    let avatarUrl = null;

                    if (client.avatar) {
                        try {
                            avatarUrl = await getPresignedUrl(client.avatar);
                        } catch (error) {
                            console.error(`Erro ao gerar URL do avatar para cliente ${client.id}:`, error);
                            avatarUrl = null;
                        }
                    }

                    return {
                        id: client.id,
                        name: client.name,
                        avatar: avatarUrl,
                        companyName: client.companies[0].company.name || 'Sem empresa',
                        companyId: client.companies[0].company.id || null,
                        projectsCount: client.companies[0].company.Project?.length || 0
                    };
                })
            );

            // Buscar distribuição por planos
            const plansDistribution = await prisma.subscription.groupBy({
                by: ['planId'],
                where: {
                    isActive: true
                },
                _count: {
                    planId: true
                }
            });

            // Buscar detalhes dos planos
            const plansDetails = await prisma.plan.findMany({
                where: {
                    id: {
                        in: plansDistribution.map(pd => pd.planId)
                    }
                },
                select: {
                    id: true,
                    name: true
                }
            });

            // Calcular total de subscriptions ativas
            const totalActiveSubscriptions = plansDistribution.reduce((acc, plan) => acc + plan._count.planId, 0);

            // Formatar dados da distribuição de planos com percentuais
            const formattedPlansDistribution = plansDistribution.map(planDist => {
                const planDetail = plansDetails.find(p => p.id === planDist.planId);
                const percentage = totalActiveSubscriptions > 0
                    ? Math.round((planDist._count.planId / totalActiveSubscriptions) * 100)
                    : 0;

                return {
                    name: planDetail?.name || 'Plano desconhecido',
                    count: planDist._count.planId,
                    percentage: percentage
                };
            });

            return response.json({
                clients: clients.length,
                activeProjects: activeProjects.length,
                activePlans: activePlans.length,
                permissionsGroups: permissionsGroups.length,
                cumulativeCustomers: cumulativeData,
                recentClients: formattedRecentClients,
                plansDistribution: formattedPlansDistribution
            });

        } catch (error) {
            console.error("Erro no DashboardController:", error);
            return response.status(500).json({
                error: "Internal server error"
            });
        }
    }
}