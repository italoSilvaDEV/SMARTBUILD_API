import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

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
                    canceledAt: true,
                    canceledById: true,

                    project: {
                        select: {
                            id: true,
                            status_project: true,
                            autorId: true,
                        }
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
                }
            })

            return res.status(200).json({
                estimates
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while fetching estimates"
            })
        }
    }
}