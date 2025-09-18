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
            select: {
                id: true,
                type_estimate: true,
                projectId: true,
                project: {
                    select: {
                        id: true,
                        company_id: true,
                        serviceProject: {
                            select: {
                                hours: true,
                                price: true
                            }
                        }
                    }
                },
                serviceProjects: {
                    select: {
                        quantity: true,
                        unitPrice: true
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
            await prisma.$transaction(async (smartbuild) => {
                const newService = await smartbuild.estimateServiceProject.create({
                    data: {
                        estimateId: estimate.id,
                        name,
                        description: description || "",
                        quantity,
                        unitPrice,
                        lineTotal,
                        notes,
                        id_service: id_service || null,
                        hours: hours,
                        price: price,
                        start_date,
                        deadline
                    }
                })

                const totalAmount = estimate.serviceProjects.reduce((total, service) => {
                    return total + Number(service.quantity) * Number(service.unitPrice)
                }, 0)

                const invoices = await prisma.invoice.findMany({
                    where: {
                        estimateId: estimate.id,
                        status: "paid"
                    },
                    select: {
                        totalAmount: true
                    }
                })

                const totalAmountPaid = invoices.reduce((total, invoice) => {
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
                    await smartbuild.serviceProject.create({
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

                    const totalAmount = estimate.project.serviceProject.reduce((total, service) => {
                        return total + Number(service.hours) * Number(service.price)
                    }, 0)

                    const invoicesProject = await prisma.invoice.findMany({
                        where: {
                            projectId: estimate.projectId,
                            status: "paid"
                        },
                        select: {
                            totalAmount: true
                        }
                    })

                    const totalAmountPaid = invoicesProject.reduce((total, invoice) => {
                        return total + Number(invoice.totalAmount)
                    }, 0)

                    await smartbuild.project.update({
                        where: {
                            id: estimate.projectId
                        },
                        data: {
                            balanceDue: totalAmount - Number(totalAmountPaid)
                        }
                    })
                }

                return res.status(201).json({
                    message: "Service created successfully",
                    data: newService
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while creating service estimate"
            })
        }
    }
}