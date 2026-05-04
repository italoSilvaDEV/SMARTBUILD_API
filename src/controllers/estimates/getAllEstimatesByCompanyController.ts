import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import dayjs from "dayjs";
import { getEstimateEffectiveTotal } from "../../utils/estimateDiscount";

function getDateRange(periodType: string) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date | undefined;

    switch (periodType) {
        case "thisYear":
            startDate = new Date(now.getFullYear(), 0, 1);
            break;

        case "thisQuarter":
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            break;

        case "last3Months":
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 3);
            break;

        case "lastMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case "thisMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;

        case "last30Days":
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
            break;

        case "allPeriod":
            startDate = new Date(2020, 0, 1);
            break;

        default:
            startDate = new Date(2020, 0, 1);
    }

    return { startDate, endDate };
}

export class GetAllEstimatesByCompanyController {
    async handle(req: Request, res: Response) {
        const { companyId } = req.params

        const { period = "allPeriod", statusFilters, startDate: queryStartDate, endDate: queryEndDate } = req.query;

        const parseFilter = (filter: any) => {
            if (!filter) return undefined;
            if (Array.isArray(filter)) return filter as string[];
            return [filter as string];
        };

        const statusArr = parseFilter(statusFilters);

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
            })
        }

        const validPeriods = [
            "thisYear",
            "thisQuarter",
            "last3Months",
            "lastMonth",
            "thisMonth",
            "last30Days",
            "allPeriod"
        ];

        if (!validPeriods.includes(period as string)) {
            return res.status(400).json({
                error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
            });
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

        const userId = (req as any).userId as string | undefined;
        let projectFilterBySeller: { seller_user_id?: string } = {};
        if (userId) {
            const user = await prisma.user.findUnique({
                where: { id: userId },
                select: { estimateEditAll: true },
            });
            if (user?.estimateEditAll !== true) {
                projectFilterBySeller = { seller_user_id: userId };
            }
        }

        let startDate: Date;
        let endDate: Date | undefined;
        let isCustomRange = false;

        if (queryStartDate && queryEndDate) {
            startDate = dayjs(queryStartDate as string).toDate();
            endDate = dayjs(queryEndDate as string).toDate();
            isCustomRange = true;
        } else {
            const range = getDateRange(period as string);
            startDate = range.startDate;
            endDate = range.endDate;
        }

        const dateFilter: any = {};
        if (isCustomRange || period !== "allPeriod") {
            dateFilter.gte = startDate;
            if (endDate) {
                dateFilter.lte = endDate;
            }
        }

        try {
            const estimates = await prisma.estimate.findMany({
                where: {
                    project: {
                        company_id: companyId,
                        ...projectFilterBySeller,
                    },
                    ...(statusArr && statusArr.length > 0 && {
                        status: { in: statusArr }
                    }),
                    ...(Object.keys(dateFilter).length > 0 && {
                        date_creation: dateFilter
                    })
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
                    date_creation: true,
                    type_estimate: true,
                    multi_emails: true,
                    isStandaloneEstimate: true,
                    assignatureRequired: true,
                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            autorId: true,
                            location: true,
                            lat: true,
                            log: true,
                            radius: true,
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

                const totalInvoices = invoices.reduce((acc, invoice) => acc + Number(invoice.totalAmount), 0)
                const effectiveTotal = getEstimateEffectiveTotal({
                    totalAmount: estimate.totalAmount,
                    finalAmount: estimate.finalAmount,
                    discountAmount: estimate.discountAmount,
                })

                const balanceDue = estimate.balanceDue !== null && estimate.balanceDue !== undefined
                    ? Number(estimate.balanceDue)
                    : Number((effectiveTotal - totalInvoices).toFixed(2))

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
                    totalAmount: Number(estimate.totalAmount),
                    balanceDue: balanceDue,
                    amountPaid: Number(totalInvoices),
                    discountValue: estimate.discountValue !== null && estimate.discountValue !== undefined ? Number(estimate.discountValue) : null,
                    discountAmount: estimate.discountAmount !== null && estimate.discountAmount !== undefined ? Number(estimate.discountAmount) : null,
                    finalAmount: estimate.finalAmount !== null && estimate.finalAmount !== undefined ? Number(estimate.finalAmount) : null,
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
                            quantity: Number(service.quantity),
                            originalUnitPrice: service.originalUnitPrice !== null && service.originalUnitPrice !== undefined ? Number(service.originalUnitPrice) : null,
                            originalLineTotal: service.originalLineTotal !== null && service.originalLineTotal !== undefined ? Number(service.originalLineTotal) : null,
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
