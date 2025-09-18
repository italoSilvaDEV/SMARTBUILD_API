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
                await prisma.$transaction(async (smartbuild) => {
                    const updatedServiceEstimate = await smartbuild.estimateServiceProject.update({
                        where: {
                            id: serviceId
                        },
                        data: campos,
                        select: {
                            estimateId: true
                        }
                    })

                    const estimate = await smartbuild.estimate.findUnique({
                        where: {
                            id: updatedServiceEstimate.estimateId
                        },
                        select: {
                            id: true,
                            projectId: true,
                            type_estimate: true,
                            serviceProjects: {
                                select: {
                                    quantity: true,
                                    unitPrice: true
                                }
                            }
                        }
                    })

                    if (estimate) {
                        const totalAmount = estimate.serviceProjects.reduce((total, service) => {
                            return total + Number(service.quantity) * Number(service.unitPrice)
                        }, 0)

                        const invoicesEstimate = await prisma.invoice.findMany({
                            where: {
                                estimateId: estimate.id,
                                status: "paid"
                            },
                            select: {
                                totalAmount: true
                            }
                        })

                        const totalAmountPaid = invoicesEstimate.reduce((total, invoice) => {
                            return total + Number(invoice.totalAmount)
                        }, 0)

                        await smartbuild.estimate.update({
                            where: {
                                id: estimate.id
                            },
                            data: {
                                balanceDue: totalAmount - Number(totalAmountPaid)
                            }
                        })

                        if (estimate.type_estimate === "estimateProject") {
                            const invoicesProject = await prisma.invoice.findMany({
                                where: {
                                    projectId: estimate.projectId,
                                    status: "paid"
                                },
                                select: {
                                    totalAmount: true
                                }
                            })

                            const totalAmountPaidProject = invoicesProject.reduce((total, invoice) => {
                                return total + Number(invoice.totalAmount)
                            }, 0)

                            await smartbuild.project.update({
                                where: {
                                    id: estimate.projectId
                                },
                                data: {
                                    balanceDue: totalAmount - Number(totalAmountPaidProject)
                                }
                            })
                        }
                    }

                    return res.status(200).json({
                        message: "Service estimate updated successfully",
                        data: updatedServiceEstimate
                    })
                })
            }

            if (serviceProject) {
                await prisma.$transaction(async (smartbuild) => {
                    const updatedServiceProject = await smartbuild.serviceProject.update({
                        where: {
                            id: serviceId
                        },
                        data: campos,
                        select: {
                            projectId: true
                        }
                    })

                    const project = await smartbuild.project.findUnique({
                        where: {
                            id: updatedServiceProject.projectId || ""
                        },
                        select: {
                            id: true,
                            serviceProject: {
                                select: {
                                    hours: true,
                                    price: true
                                }
                            }
                        }
                    })

                    if (project) {
                        const totalAmount = project.serviceProject.reduce((total, service) => {
                            return total + Number(service.hours) * Number(service.price)
                        }, 0)

                        const invoicesProject = await prisma.invoice.findMany({
                            where: {
                                projectId: project.id,
                                status: "paid"
                            },
                            select: {
                                totalAmount: true
                            }
                        })

                        const totalAmountPaidProject = invoicesProject.reduce((total, invoice) => {
                            return total + Number(invoice.totalAmount)
                        }, 0)

                        await smartbuild.project.update({
                            where: {
                                id: project.id
                            },
                            data: {
                                balanceDue: totalAmount - Number(totalAmountPaidProject)
                            }
                        })
                    }

                    return res.status(200).json({
                        message: "Service project updated successfully",
                        data: updatedServiceProject
                    })
                })
            }
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while updating service estimate"
            })
        }
    }
}