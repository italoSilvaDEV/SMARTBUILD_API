import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

interface ServicePayload {
    estimateId: string
    name: string
    description?: string // INTRODUCTION LATTER
    quantity: number
    unitPrice: number
    lineTotal: number
    notes?: string
    id_service?: string
    hours?: number
    price?: number
    start_date?: string
    deadline?: string
}

export class CreateServiceEstimateController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
            name,
            description,
            quantity,
            unitPrice,
            lineTotal,
            notes,
            id_service,
            hours,
            price,
            start_date,
            deadline
        } = req.body as ServicePayload

        if (!estimateId) {
            return res.status(400).json({
                error: "Estimate ID is required"
            })
        }

        const estimate = await prisma.estimate.findUnique({
            where: {
                id: estimateId
            },
            include: {
                project: {
                    select: {
                        company_id: true
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        if (!name || !quantity || !unitPrice || !lineTotal) {
            return res.status(400).json({
                error: "Name, quantity, unitPrice and lineTotal are required"
            })
        }

        try {

            const existingService = await prisma.estimateServiceProject.findFirst({
                where: {
                    estimateId: estimate.id,
                    name: name
                }
            })

            if (existingService) {
                return res.status(200).json({
                    message: "Service already exists",
                })
            }

            const newService = await prisma.estimateServiceProject.create({
                data: {
                    estimateId: estimate.id,
                    name,
                    description,
                    quantity,
                    unitPrice,
                    lineTotal,
                    notes,
                    id_service: id_service || null,
                    hours,
                    price,
                    start_date,
                    deadline
                }
            })

            if (estimate.type_estimate === "estimateProject") {
                await prisma.serviceProject.create({
                    data: {
                        projectId: estimate.projectId,
                        company_id: estimate.project.company_id,
                        name,
                        description: description || "",
                        id_service: id_service || null,
                        hours: hours || 0,
                        price: price || 0,
                        start_date,
                        deadline
                    }
                })
            }

            return res.status(201).json({
                message: "Service created successfully",
                data: newService
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while creating service estimate"
            })
        }
    }
}