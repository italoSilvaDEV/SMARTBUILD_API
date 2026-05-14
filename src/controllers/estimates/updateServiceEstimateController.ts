import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";

type Fields = {
    name?: string
    description?: string
    quantity?: number
    unitPrice?: number
    lineTotal?: number
    originalUnitPrice?: number
    originalLineTotal?: number
    notes?: string
    hours?: number
    price?: number
    start_date?: string
    deadline?: string
}

const DISCOUNT_ERRORS = new Set([
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
]);

export class UpdateServiceEstimateController {
    async handle(req: Request, res: Response) {
        const {
            serviceId,
            name,
            description,
            quantity,
            unitPrice,
            lineTotal,
            notes,
            hours,
            price,
            start_date,
            deadline,
        } = req.body

        if (!serviceId) {
            return res.status(400).json({
                error: "Service ID is required"
            })
        }

        const serviceEstimate = await prisma.estimateServiceProject.findUnique({
            where: {
                id: serviceId
            },
            include: {
                estimate: {
                    select: {
                        project: {
                            select: {
                                company_id: true,
                            }
                        }
                    }
                }
            }
        })

        const serviceProject = await prisma.serviceProject.findUnique({
            where: {
                id: serviceId
            }
        })

        if (!serviceEstimate && !serviceProject) {
            return res.status(404).json({
                error: "Service not found"
            })
        }

        const hasAnyField =
            name !== undefined ||
            description !== undefined ||
            quantity !== undefined ||
            unitPrice !== undefined ||
            lineTotal !== undefined ||
            notes !== undefined ||
            hours !== undefined ||
            price !== undefined ||
            start_date !== undefined ||
            deadline !== undefined

        if (!hasAnyField) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (name !== undefined) {
                campos.name = name
            }
            if (description !== undefined) {
                campos.description = description
            }
            if (quantity !== undefined) {
                campos.quantity = Number(quantity)
            }
            if (unitPrice !== undefined) {
                campos.unitPrice = Number(unitPrice)
                campos.originalUnitPrice = Number(unitPrice)
            }
            if (lineTotal !== undefined && serviceEstimate) {
                campos.lineTotal = Number(lineTotal)
                campos.originalLineTotal = Number(lineTotal)
            }
            if (notes !== undefined) {
                campos.notes = notes
            }
            if (hours !== undefined) {
                campos.hours = Number(hours)
            }
            if (price !== undefined) {
                campos.price = Number(price)
            }
            if (start_date !== undefined) {
                campos.start_date = start_date
            }
            if (deadline !== undefined) {
                campos.deadline = deadline
            }

            if (serviceEstimate) {
                const updatedServiceEstimate = await prisma.$transaction(async (tx) => {
                    await tx.estimateServiceProject.update({
                        where: { id: serviceId },
                        data: campos,
                    })

                    await syncEstimateDiscountedServices(tx, serviceEstimate.estimateId)

                    return tx.estimateServiceProject.findUnique({
                        where: { id: serviceId }
                    })
                })

                fireAndForgetUpsertEstimateToQBO(serviceEstimate.estimate?.project?.company_id, (req as any).userId, serviceEstimate.estimateId);

                return res.status(200).json({
                    message: "Service estimate updated successfully",
                    data: updatedServiceEstimate
                })
            }

            if (serviceProject) {
                const updatedServiceProject = await prisma.serviceProject.update({
                    where: {
                        id: serviceId
                    },
                    data: campos,
                })

                return res.status(200).json({
                    message: "Service project updated successfully",
                    data: updatedServiceProject
                })
            }
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

            return res.status(500).json({
                error: "Internal server error while updating service estimate"
            })
        }
    }
}

