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
                    userCompanies: {
                        include: {
                            user: {
                                include: {
                                    office: true
                                }
                            },
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
                    }
                }
            });

            // Buscar assinatura ativa atual
            const activeSubscription = await prisma.subscription.findFirst({
                where: {
                    companyId: companyId,
                    isActive: true
                },
                include: {
                    plan: true
                }
            });

            if (!company) {
                return response.status(404).json({
                    error: "Company not found"
                });
            }

            const adminUser = company.userCompanies.find(user =>
                user.user.office?.name === "Administrator"
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
                admin: company.userCompanies.filter(user => user.user.office?.name === "Administrator").length,
                worker: company.userCompanies.filter(user => user.user.office?.name === "Worker").length,
                seller: company.userCompanies.filter(user => user.user.office?.name === "Seller").length,
                total: company.userCompanies.length
            };



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



            return response.json({
                company: {
                    id: company.id,
                    name: company.name,
                    avatar: companyAvatarUrl
                },
                clientDetails: {
                    name: adminUser.user.name,
                    email: adminUser.user.email,
                    phone: adminUser.user.phone,
                    cityAndState: adminUser.user.city_and_state
                },
                usersData: usersByRole,
                overview: {
                    totalProjects: company.Project.length,
                    totalInvoices: company.invoices.length
                },
                currentPlan: currentPlan
            });

        } catch (error) {
            console.error("Erro no FindClientById:", error);
            return response.status(500).json({
                error: "Internal server error"
            });
        }
    }
}