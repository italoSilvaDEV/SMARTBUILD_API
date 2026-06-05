import { Request, Response } from "express";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { prisma } from "../../utils/prisma";

function isOwnerOfficeName(name?: string | null) {
    return String(name || "").trim().toLowerCase() === "owner";
}

function hasOwnerUpdatePayload(data: {
    userName?: unknown;
    userEmail?: unknown;
    userPhone?: unknown;
    userDocument?: unknown;
}) {
    return [data.userName, data.userEmail, data.userPhone, data.userDocument].some(
        value => value !== undefined
    );
}

function parseExtraEmployees(value: unknown) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error("Extra employees must be a non-negative integer");
    }
    return parsed;
}

async function updateCompanyExtraEmployees(companyId: string, targetExtraEmployees: number) {
    await prisma.company.update({
        where: { id: companyId },
        data: {
            extraEmployees: targetExtraEmployees === 0 ? null : targetExtraEmployees,
        },
    });
}

export class FindClientById {
    async handle(request: Request, response: Response) {
        try {
            const { companyId } = request.params;

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    userCompanies: {
                        include: {
                            user: true,
                            office: true,
                        },
                    },
                    Project: {
                        select: { id: true },
                    },
                    invoices: {
                        select: { id: true },
                    },
                },
            });

            if (!company) {
                return response.status(404).json({
                    error: "Company not found",
                });
            }

            const activeSubscription = await prisma.subscription.findFirst({
                where: {
                    companyId,
                    isActive: true,
                },
                include: {
                    plan: true,
                },
            });

            const ownerUser = company.userCompanies.find(uc =>
                isOwnerOfficeName(uc.office?.name)
            );

            let companyAvatarUrl = null;
            if (company.avatar) {
                try {
                    companyAvatarUrl = await getPresignedUrl(company.avatar);
                } catch (error) {
                    console.error(`Error generating company avatar URL ${company.id}:`, error);
                    companyAvatarUrl = null;
                }
            }

            const usersByRole = {
                admin: company.userCompanies.filter(uc => uc.office?.name === "Administrator").length,
                worker: company.userCompanies.filter(uc => uc.office?.name === "Worker").length,
                seller: company.userCompanies.filter(uc => uc.office?.name === "Seller").length,
                total: company.userCompanies.length,
            };

            const currentPlan = activeSubscription ? {
                name: activeSubscription.plan?.name || "Plan not found",
                price: activeSubscription.plan?.price ? Number(activeSubscription.plan.price) : 0,
                type: activeSubscription.plan?.validityType || "Unknown",
                startDate: activeSubscription.startDate,
                endDate: activeSubscription.endDate,
            } : null;

            return response.json({
                company: {
                    id: company.id,
                    name: company.name,
                    avatar: companyAvatarUrl,
                    date_creation: company.date_creation,
                    allowedEmployees: company.allowedEmployees ?? 0,
                    extraEmployees: company.extraEmployees ?? 0,
                },
                ownerMissing: !ownerUser,
                clientDetails: ownerUser ? {
                    name: ownerUser.user.name,
                    email: ownerUser.user.email,
                    phone: ownerUser.user.phone,
                    cityAndState: ownerUser.user.city_and_state,
                } : null,
                usersData: usersByRole,
                overview: {
                    totalProjects: company.Project.length,
                    totalInvoices: company.invoices.length,
                },
                currentPlan,
                extraEmployees: company.extraEmployees ?? 0,
                allowedEmployees: company.allowedEmployees ?? 0,
            });
        } catch (error) {
            console.error("Error in FindClientById:", error);
            return response.status(500).json({
                error: "Internal server error",
            });
        }
    }
}

export class GetClientEditData {
    async handle(request: Request, response: Response) {
        try {
            const { companyId } = request.params;

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    userCompanies: {
                        include: {
                            user: true,
                            office: true,
                        },
                    },
                },
            });

            if (!company) {
                return response.status(404).json({
                    error: "Company not found",
                });
            }

            const ownerUser = company.userCompanies.find(uc =>
                isOwnerOfficeName(uc.office?.name)
            );

            const latestSubscription = await prisma.subscription.findFirst({
                where: { companyId },
                include: { plan: true },
                orderBy: { startDate: "desc" },
            });

            let subscriptionData = null;
            if (latestSubscription && latestSubscription.plan?.validityType === "FREE") {
                subscriptionData = {
                    id: latestSubscription.id,
                    planName: latestSubscription.plan.name,
                    startDate: latestSubscription.startDate,
                    endDate: latestSubscription.endDate,
                    isActive: latestSubscription.isActive,
                };
            }

            return response.json({
                ownerMissing: !ownerUser,
                user: ownerUser ? {
                    id: ownerUser.user.id,
                    name: ownerUser.user.name,
                    email: ownerUser.user.email,
                    phone: ownerUser.user.phone || "",
                    document: ownerUser.user.document || "",
                } : null,
                company: {
                    id: company.id,
                    allowedEmployees: company.allowedEmployees || 0,
                    extraEmployees: company.extraEmployees || 0,
                    isActive: company.isActive ?? true,
                },
                subscription: subscriptionData,
            });
        } catch (error) {
            console.error("Error in GetClientEditData:", error);
            return response.status(500).json({
                error: "Internal server error",
            });
        }
    }
}

export class UpdateClientData {
    async handle(request: Request, response: Response) {
        try {
            const { companyId } = request.params;
            const {
                userName,
                userEmail,
                userPhone,
                userDocument,
                extraEmployees,
                subscriptionEndDate,
                subscriptionId,
            } = request.body;

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                include: {
                    userCompanies: {
                        include: {
                            user: true,
                            office: true,
                        },
                    },
                },
            });

            if (!company) {
                return response.status(404).json({
                    error: "Company not found",
                });
            }

            const ownerUser = company.userCompanies.find(uc =>
                isOwnerOfficeName(uc.office?.name)
            );
            const shouldUpdateOwner = hasOwnerUpdatePayload({
                userName,
                userEmail,
                userPhone,
                userDocument,
            });

            if (!ownerUser && shouldUpdateOwner) {
                return response.status(404).json({
                    error: "Owner user not found for this company",
                });
            }

            if (ownerUser && shouldUpdateOwner) {
                if (!userName || !userEmail) {
                    return response.status(400).json({
                        error: "Owner name and email are required",
                    });
                }

                await prisma.user.update({
                    where: { id: ownerUser.user.id },
                    data: {
                        name: userName,
                        email: userEmail,
                        phone: userPhone,
                        document: userDocument,
                    },
                });
            }

            if (extraEmployees !== undefined) {
                await updateCompanyExtraEmployees(companyId, parseExtraEmployees(extraEmployees));
            }

            if (subscriptionId && subscriptionEndDate) {
                await prisma.subscription.update({
                    where: { id: subscriptionId },
                    data: {
                        endDate: new Date(subscriptionEndDate),
                    },
                });
            }

            return response.json({
                success: true,
                message: "Client data updated successfully",
            });
        } catch (error) {
            console.error("Error in UpdateClientData:", error);
            const message = error instanceof Error ? error.message : "Internal server error";
            return response.status(500).json({
                error: message,
            });
        }
    }
}
