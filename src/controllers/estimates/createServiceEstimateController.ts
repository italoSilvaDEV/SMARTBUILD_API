import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";

interface ServicePayload {
    estimateId: string
    name: string
    description?: string
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

const DISCOUNT_ERRORS = new Set([
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
]);

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
            select: {
                id: true,
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        if (
            !name ||
            quantity === undefined ||
            quantity === null ||
            unitPrice === undefined ||
            unitPrice === null ||
            lineTotal === undefined ||
            lineTotal === null
        ) {
            return res.status(400).json({
                error: "Name, quantity, unitPrice and lineTotal are required"
            })
        }

        try {
            let newServiceId = ""

            await prisma.$transaction(async (smartbuild) => {
                const newService = await smartbuild.estimateServiceProject.create({
                    data: {
                        estimateId: estimate.id,
                        name,
                        description: description || "",
                        quantity: Number(quantity),
                        unitPrice: Number(unitPrice),
                        lineTotal: Number(lineTotal),
                        originalUnitPrice: Number(unitPrice),
                        originalLineTotal: Number(lineTotal),
                        notes,
                        id_service: id_service || null,
                        hours: hours,
                        price: price,
                        start_date,
                        deadline
                    }
                })

                newServiceId = newService.id

                await syncEstimateDiscountedServices(smartbuild, estimate.id)
            })

            const createdService = await prisma.estimateServiceProject.findUnique({
                where: { id: newServiceId }
            })

            return res.status(201).json({
                message: "Service created successfully",
                data: createdService
            })
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

            console.error("Error creating service estimate:", error)
            return res.status(500).json({
                error: "Internal server error while creating service estimate"
            })
        }
    }
}

