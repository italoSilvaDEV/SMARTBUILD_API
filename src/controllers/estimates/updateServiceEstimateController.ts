import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

type Fields = {
    name?: string
    description?: string
    quantity?: number
    unitPrice?: number
    lineTotal?: number
    notes?: string
    hours?: number
    price?: number
    start_date?: string
    deadline?: string
}

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

        if (!name && !description && !quantity && !unitPrice && !lineTotal && !notes && !hours && !price && !start_date && !deadline) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (name) {
                campos.name = name
            }
            if (description) {
                campos.description = description
            }
            if (quantity) {
                campos.quantity = quantity
            }
            if (unitPrice) {
                campos.unitPrice = unitPrice
            }
            if (lineTotal && serviceEstimate) {
                campos.lineTotal = lineTotal
            }
            if (notes) {
                campos.notes = notes
            }
            if (hours) {
                campos.hours = hours
            }
            if (price) {
                campos.price = price
            }
            if (start_date) {
                campos.start_date = start_date
            }
            if (deadline) {
                campos.deadline = deadline
            }

            if (serviceEstimate) {
                const updatedServiceEstimate = await prisma.estimateServiceProject.update({
                    where: {
                        id: serviceId
                    },
                    data: campos
                })

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
                    data: campos
                })
                return res.status(200).json({
                    message: "Service project updated successfully",
                    data: updatedServiceProject
                })
            }
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while updating service estimate"
            })
        }
    }
}