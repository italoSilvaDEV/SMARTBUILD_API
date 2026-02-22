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

        if (!name && description === null && !quantity && !unitPrice && !lineTotal && notes === null && !hours && !price && !start_date && !deadline) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (name) {
                campos.name = name
            }
            if (description !== undefined) {
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
            if (notes !== undefined) {
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
                const siblingProject = await prisma.serviceProject.findFirst({
                    where: { estimateServiceId: serviceId }
                })

                const dataSync: Partial<{ name: string; description: string; hours: number; price: number; start_date: string; deadline: string }> = {}
                if (campos.name !== undefined) dataSync.name = campos.name
                if (campos.description !== undefined && campos.description !== null) dataSync.description = campos.description
                if (campos.hours !== undefined) dataSync.hours = campos.hours
                if (campos.price !== undefined) dataSync.price = campos.price
                if (campos.start_date !== undefined) dataSync.start_date = campos.start_date
                if (campos.deadline !== undefined) dataSync.deadline = campos.deadline

                const updatedServiceEstimate = await prisma.$transaction(async (tx) => {
                    const updated = await tx.estimateServiceProject.update({
                        where: { id: serviceId },
                        data: campos,
                    })
                    if (siblingProject && Object.keys(dataSync).length > 0) {
                        await tx.serviceProject.update({
                            where: { id: siblingProject.id },
                            data: dataSync,
                        })
                    }
                    return updated
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
                    data: campos,
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