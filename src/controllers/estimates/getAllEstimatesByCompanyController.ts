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
                        company_id: companyId,
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
                    date_creation: true,
                    balanceDue: true,
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
                                    phone: true,
                                    addressOffice: true,
                                    city_and_state: true,
                                    date_creation: true,
                                    date_update: true,
                                    workContexts: {
                                        where: {
                                            isActive: true
                                        },
                                        select: {
                                            id: true,
                                            Name: true,
                                            Email: true,
                                            phone: true,
                                            addressOffice: true,
                                            type: true
                                        }
                                    }
                                }
                            },
                            workContext: {
                                select: {
                                    id: true,
                                    Name: true,
                                    Email: true,
                                    phone: true,
                                    addressOffice: true,
                                    type: true,
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
                    InvoicePaymentTimeLine: true,
                },
                orderBy: {
                    number: "desc"
                }
            })

            const estimatesWithPresignedUrls = await Promise.all(estimates.map(async (estimate) => {
                const invoices = await prisma.invoice.findMany({
                    where: {
                        estimateId: estimate.id,
                        status: "paid"
                    },
                    select: {
                        totalAmount: true
                    }
                })

                const services = await prisma.estimateServiceProject.findMany({
                    where: {
                        estimateId: estimate.id
                    },
                    select: {
                        quantity: true,
                        unitPrice: true
                    }
                })

                const totalInvoices = invoices.reduce((acc, invoice) => acc + Number(invoice.totalAmount), 0)
                const totalAmount = services.reduce((acc, service) => acc + Number(service.quantity) * Number(service.unitPrice), 0)

                const balanceDue = Number(totalAmount) - Number(totalInvoices) || 0
                let pdfProjectData = null;
                if (estimate.PdfProject && estimate.PdfProject.length > 0) {
                    const pdf = estimate.PdfProject[0];
                    pdfProjectData = {
                        id: pdf.id,
                        uri: pdf.uri ? await getPresignedUrl(pdf.uri) : null,
                        templateNumber: pdf.templateNumber
                    };
                }

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

                let clientAvatar = null;
                if (estimate.project.client?.avatar) {
                    clientAvatar = await getPresignedUrl(estimate.project.client.avatar);
                }

                let userAvatar = null;
                if (estimate.project.user?.avatar) {
                    userAvatar = await getPresignedUrl(estimate.project.user.avatar);
                }

                const urlCompanyAvatar = estimate.project.company?.avatar ? await getPresignedUrl(estimate.project.company.avatar) : null

                return {
                    ...estimate,
                    balanceDue: balanceDue,
                    amountPaid: Number(totalInvoices),
                    project: {
                        ...estimate.project,
                        client: estimate.project.client ? {
                            ...estimate.project.client,
                            avatar: clientAvatar
                        } : null,
                        user: estimate.project.user ? {
                            ...estimate.project.user,
                            avatar: userAvatar
                        } : null,
                        company: {
                            ...estimate.project.company,
                            avatar: urlCompanyAvatar
                        }
                    },
                    PdfProject: pdfProjectData,
                    imagesAttachments: imagesAttachmentsData,
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