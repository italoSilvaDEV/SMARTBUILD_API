import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class FindClientById {
    async handle(request: Request, response: Response) {
        try {
            const { companyId } = request.params;

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    User: {
                        include: {
                            office: true
                        }
                    },
                    Project: {
                        select: {
                            id: true
                        }
                    },
                    invoices: {
                        select: {
                            id: true
                        }
                    },
                    Subscription: {
                        include: {
                            plan: true
                        },
                        orderBy: {
                            startDate: 'desc'
                        }
                    }
                }
            });

            if (!company) {
                return response.status(404).json({
                    error: "Company not found"
                });
            }

            const adminUser = company.User.find(user =>
                user.office?.name === "Administrator"
            );

            if (!adminUser) {
                return response.status(404).json({
                    error: "Admin user not found for this company"
                });
            }

            let companyAvatarUrl = null;
            if (company.avatar) {
                try {
                    companyAvatarUrl = await getPresignedUrl(company.avatar);
                } catch (error) {
                    console.error(`Erro ao gerar URL do avatar da company ${company.id}:`, error);
                    companyAvatarUrl = null;
                }
            }

            const usersByRole = {
                admin: company.User.filter(user => user.office?.name === "Administrator").length,
                worker: company.User.filter(user => user.office?.name === "Worker").length,
                seller: company.User.filter(user => user.office?.name === "Seller").length,
                total: company.User.length
            };

            const totalSpent = company.Subscription.reduce((total, subscription) => {
                const price = subscription.plan?.price ? Number(subscription.plan.price) : 0;
                const startDate = new Date(subscription.startDate);
                const endDate = subscription.isActive ? new Date() : new Date(subscription.endDate);

                // Calcular diferença em meses
                const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                    (endDate.getMonth() - startDate.getMonth()) + 1;

                // Para planos mensais, multiplicar pelo número de meses
                // Para outros tipos, considerar apenas o preço unitário
                const validityType = subscription.plan?.validityType;
                let totalForSubscription = 0;

                if (validityType === 'MONTHLY') {
                    totalForSubscription = price * Math.max(1, months);
                } else if (validityType === 'ANNUAL') {
                    const years = Math.ceil(months / 12);
                    totalForSubscription = price * years;
                } else {
                    // Para FREE, CUSTOM, DAYS
                    totalForSubscription = price;
                }

                return total + totalForSubscription;
            }, 0);

            const activeSubscription = company.Subscription.find(sub => sub.isActive);

            let currentPlan = null;
            if (activeSubscription) {
                currentPlan = {
                    name: activeSubscription.plan?.name || 'Plano não encontrado',
                    price: activeSubscription.plan?.price ? Number(activeSubscription.plan.price) : 0,
                    type: activeSubscription.plan?.validityType || 'Unknown',
                    startDate: activeSubscription.startDate,
                    endDate: activeSubscription.endDate
                };
            }

            const subscriptionHistory = company.Subscription.map(subscription => {
                const startDate = new Date(subscription.startDate);
                const endDate = new Date(subscription.endDate);
                const isActive = subscription.isActive;

                // Formatar o mês de referência
                const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
                const month = `${monthNames[startDate.getMonth()]} ${startDate.getFullYear()}`;

                return {
                    id: subscription.id,
                    planName: subscription.plan?.name || 'Plano não encontrado',
                    price: subscription.plan?.price ? Number(subscription.plan.price) : 0,
                    month: month,
                    startDate: subscription.startDate,
                    endDate: subscription.endDate,
                    status: isActive ? 'Active' : 'Expired',
                    isActive: isActive,
                    validityType: subscription.plan?.validityType || 'Unknown'
                };
            });

            return response.json({
                company: {
                    id: company.id,
                    name: company.name,
                    avatar: companyAvatarUrl,
                    totalSpent: totalSpent
                },
                clientDetails: {
                    name: adminUser.name,
                    email: adminUser.email,
                    phone: adminUser.phone,
                    cityAndState: adminUser.city_and_state
                },
                usersData: usersByRole,
                overview: {
                    totalProjects: company.Project.length,
                    totalInvoices: company.invoices.length
                },
                currentPlan: currentPlan,
                subscriptionHistory: subscriptionHistory
            });

        } catch (error) {
            console.error("Erro no FindClientById:", error);
            return response.status(500).json({
                error: "Internal server error"
            });
        }
    }
}