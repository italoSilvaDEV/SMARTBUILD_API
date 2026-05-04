import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { getEstimateEffectiveTotal } from "../../utils/estimateDiscount";

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
                    balanceDue: true,
                    amountPaid: true,
                    discountType: true,
                    discountValue: true,
                    discountAmount: true,
                    finalAmount: true,
                    status: true,
                    description: true,
                    canceledAt: true,
                    canceledById: true,
                    terms: true,
                    type_estimate: true,
                    multi_emails: true,
                    assignatureRequired: true,
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            autorId: true,
                            location: true,
                            workContextId: true,
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
                        orderBy: {
                            date_creation: "asc",
                        },
                        select: {
                            id: true,
                            name: true,
                            description: true,
                            quantity: true,
                            unitPrice: true,
                            lineTotal: true,
                            originalUnitPrice: true,
                            originalLineTotal: true,
                            notes: true,
                            date_creation: true,
                            date_update: true,
                        }
                    },
                    timelineEvents: {
                        orderBy: {
                            date_creation: "asc",
                        },
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
                            uri: true,
                            templateNumber: true
                        }
                    },
                    imagesAttachments: {
                        select: {
                            id: true,
                            url: true,
                            original_filename: true,
                            title: true,
                            date_creation: true,
                            date_update: true
                        }
                    },
                    InvoicePaymentTimeLine: true
                },
            })

            if (!estimate) {
                return res.status(404).json({
                    error: "Estimate not found"
                })
            }

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
            const effectiveTotal = getEstimateEffectiveTotal({
                totalAmount: estimate.totalAmount,
                finalAmount: estimate.finalAmount,
                discountAmount: estimate.discountAmount,
            })

            let imagesAttachmentsData: any[] = [];
            if (estimate.imagesAttachments && estimate.imagesAttachments.length > 0) {
                imagesAttachmentsData = await Promise.all(
                    estimate.imagesAttachments.map(async (image) => {
                        return {
                            id: image.id,
                            url: image.url ? await getPresignedUrl(image.url) : null,
                            original_filename: image.original_filename,
                            title: image.title,
                            date_creation: image.date_creation,
                            date_update: image.date_update
                        }
                    })
                );
            }

            let pdfProjectData = null;
            if (estimate.PdfProject && estimate.PdfProject.length > 0) {
                const pdf = estimate.PdfProject[0];
                pdfProjectData = {
                    id: pdf.id,
                    uri: pdf.uri ? await getPresignedUrl(pdf.uri) : null,
                    templateNumber: pdf.templateNumber
                };
            }

            const urlUserAvatar = estimate.project.user?.avatar ? await getPresignedUrl(estimate.project.user.avatar) : null
            const urlClientAvatar = estimate.project.client?.avatar ? await getPresignedUrl(estimate.project.client.avatar) : null
            const urlCompanyAvatar = estimate.project.company?.avatar ? await getPresignedUrl(estimate.project.company.avatar) : null

            return res.status(200).json({
                data: {
                    ...estimate,
                    totalAmount: Number(estimate.totalAmount),
                    balanceDue: estimate.balanceDue !== null && estimate.balanceDue !== undefined ? Number(estimate.balanceDue) : Number((effectiveTotal - Number(totalAmountPaid)).toFixed(2)),
                    amountPaid: Number(totalAmountPaid),
                    discountValue: estimate.discountValue !== null && estimate.discountValue !== undefined ? Number(estimate.discountValue) : null,
                    discountAmount: estimate.discountAmount !== null && estimate.discountAmount !== undefined ? Number(estimate.discountAmount) : null,
                    finalAmount: estimate.finalAmount !== null && estimate.finalAmount !== undefined ? Number(estimate.finalAmount) : null,
                    PdfProject: pdfProjectData,
                    imagesAttachments: imagesAttachmentsData,
                    serviceProjects: estimate.serviceProjects.map((service) => ({
                        ...service,
                        quantity: Number(service.quantity),
                        unitPrice: Number(service.unitPrice),
                        lineTotal: Number(service.lineTotal),
                        originalUnitPrice: service.originalUnitPrice !== null && service.originalUnitPrice !== undefined ? Number(service.originalUnitPrice) : null,
                        originalLineTotal: service.originalLineTotal !== null && service.originalLineTotal !== undefined ? Number(service.originalLineTotal) : null,
                    })),
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
