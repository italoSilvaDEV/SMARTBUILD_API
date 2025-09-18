import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetEstimateByProjectIdController {
    async handle(req: Request, res: Response) {
        const {
            projectId
        } = req.params

        if (!projectId) {
            return res.status(400).json({
                error: "Project ID is required"
            })
        }

        try {
            const project = await prisma.project.findUnique({
                where: {
                    id: projectId
                },
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            const estimate = await prisma.estimate.findFirst({
                where: {
                    projectId: projectId,
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
                    }
                },
            })

            if (!estimate) {
                return res.status(404).json({
                    error: "Estimate not found"
                })
            }

            const services = await prisma.estimateServiceProject.findMany({
                where: {
                    estimateId: estimate.id
                },
                select: {
                    quantity: true,
                    unitPrice: true
                }
            })

            const totalAmount = services.reduce((acc, service) => acc + Number(service.quantity) * Number(service.unitPrice), 0)

            const invoices = await prisma.invoice.findMany({
                where: {
                    estimateId: estimate.id,
                    status: "paid"
                },
                select: {
                    totalAmount: true
                }
            })

            const totalAmountPaid = invoices.reduce((acc, invoice) => acc + Number(invoice.totalAmount), 0)

            const presignedUrls = await Promise.all(estimate.PdfProject.map(async (pdf) => {
                if (pdf.uri) {
                    return await getPresignedUrl(pdf.uri)
                }
                return null
            }).filter(Boolean))

            const urlUserAvatar = estimate.project.user?.avatar ? await getPresignedUrl(estimate.project.user.avatar) : null
            const urlClientAvatar = estimate.project.client?.avatar ? await getPresignedUrl(estimate.project.client.avatar) : null
            const urlCompanyAvatar = estimate.project.company?.avatar ? await getPresignedUrl(estimate.project.company.avatar) : null

            return res.status(200).json({
                data: {
                    ...estimate,
                    balanceDue: totalAmount - Number(totalAmountPaid),
                    PdfProject: presignedUrls,
                    project: {
                        ...estimate.project,
                        user: {
                            ...estimate.project.user,
                            avatar: urlUserAvatar
                        },
                        client: {
                            ...estimate.project.client,
                            avatar: urlClientAvatar
                        },
                        company: {
                            ...estimate.project.company,
                            avatar: urlCompanyAvatar
                        }
                    }
                }
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while fetching estimates"
            })
        }
    }
}