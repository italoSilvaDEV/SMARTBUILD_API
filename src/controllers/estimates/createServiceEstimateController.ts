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
            if (id_service) {
                const service = await prisma.service.findUnique({
                    where: {
                        id: id_service
                    }
                })

                if (!service) {
                    return res.status(404).json({
                        error: "Service not found"
                    })
                }
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