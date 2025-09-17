import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetAllEstimatesByCompanyController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
            })
        }

        const company = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!company) {
            return res.status(404).json({
                error: "Company not found"
            })
        }

        try {
            const estimates = await prisma.estimate.findMany({
                where: {
                    project: {
                        company_id: companyId
                    },
                },
                select: {
                    id: true,
                    number: true,
                    totalAmount: true,
                    status: true,
                    description: true,
                    canceledAt: true,
                    canceledById: true,
                    terms: true,
                    type_estimate: true,
                    multi_emails: true,
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            autorId: true,
                            location: true,
                            client: {
                                select: {
                                    id: true,
                                    avatar: true,
                                    name: true,
                                    email: true,
                                    city_and_state: true,
                                    date_creation: true,
                                    date_update: true,
                                }
                            },
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    avatar: true
                                }
                            },
                            serviceProject: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true,
                                    hours: true,
                                    price: true,
                                    status: true
                                }
                            },
                            company: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    address: true,
                                    district: true,
                                    numberHouse: true,
                                    avatar: true,
                                    complement: true,
                                    webSiteUrl: true,
                                    NotesContrac: {
                                        select: {
                                            id: true,
                                            notes: true,
                                            updatedAt: true,
                                            createdAt: true
                                        }
                                    }
                                }
                            }
                        },
                    },
                    serviceProjects: {
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            quantity: true,
                            unitPrice: true,
                            lineTotal: true,
                            notes: true,
                            date_creation: true,
                            date_update: true,
                        }
                    },
                    timelineEvents: {
                        select: {
                            id: true,
                            description: true,
                            date_creation: true,
                            date_update: true,
                        }
                    },
                    PdfProject: {
                        select: {
                            id: true,
                            uri: true
                        }
                    },
                },
                orderBy: {
                    date_creation: "desc"
                }
            })

            const estimatesWithPresignedUrls = await Promise.all(estimates.map(async (estimate) => {
                const presignedUrls = await Promise.all(estimate.PdfProject.map(async (pdf) => {
                    if (pdf.uri) {
                        return await getPresignedUrl(pdf.uri)
                    }
                    if (estimate.project.client?.avatar) {
                        return await getPresignedUrl(estimate.project.client.avatar)
                    }
                    if (estimate.project.user?.avatar) {
                        return await getPresignedUrl(estimate.project.user.avatar)
                    }
                    return null
                }).filter(Boolean))

                const urlCompanyAvatar = estimate.project.company?.avatar ? await getPresignedUrl(estimate.project.company.avatar) : null

                return {
                    ...estimate,
                    project: {
                        ...estimate.project,
                        company: {
                            ...estimate.project.company,
                            avatar: urlCompanyAvatar
                        }
                    },
                    PdfProject: presignedUrls,
                    serviceProjects: estimate.serviceProjects.map((service) => {
                        return {
                            ...service,
                            lineTotal: Number(service.lineTotal),
                            unitPrice: Number(service.unitPrice),
                            quantity: Number(service.quantity)
                        }
                    }),
                }
            }))

            return res.status(200).json({
                data: estimatesWithPresignedUrls
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while fetching estimates"
            })
        }
    }
}