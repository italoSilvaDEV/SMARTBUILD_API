import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DeleteServiceEstimateController {
    async handle(req: Request, res: Response) {
        const {
            serviceId,
        } = req.params

        if (!serviceId) {
            return res.status(400).json({
                error: "Service ID required"
            })
        }

        const serviceEstimate = await prisma.estimateServiceProject.findUnique({
            where: {
                id: serviceId
            },
            select: {
                estimateId: true,
            }
        })

        const serviceProject = await prisma.serviceProject.findUnique({
            where: {
                id: serviceId
            },
            select: {
                projectId: true,
            }
        })

        if (!serviceEstimate && !serviceProject) {
            return res.status(404).json({
                error: "Service not found"
            })
        }

        try {
            if (serviceEstimate) {
                await prisma.$transaction(async (smartbuild) => {
                    await prisma.estimateServiceProject.delete({
                        where: {
                            id: serviceId
                        }
                    })

                    const estimate = await smartbuild.estimate.findUnique({
                        where: {
                            id: serviceEstimate.estimateId
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

                        const invoicesProject = await prisma.invoice.findMany({
                            where: {
                                projectId: estimate.projectId,
                                status: "paid"
                            },
                            select: {
                                totalAmount: true
                            }
                        })

                        const totalAmountPaid = invoicesEstimate.reduce((total, invoice) => {
                            return total + Number(invoice.totalAmount)
                        }, 0)

                        const totalAmountPaidProject = invoicesProject.reduce((total, invoice) => {
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
                        message: "Service estimate deleted successfully"
                    })
                })
            }

            if (serviceProject) {
                await prisma.$transaction(async (smartbuild) => {
                    await prisma.serviceProject.delete({
                        where: {
                            id: serviceId
                        }
                    })

                    const project = await smartbuild.project.findUnique({
                        where: {
                            id: serviceProject.projectId || ""
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
                        message: "Service project deleted successfully"
                    })
                })
            }
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while deleting service estimate"
            })
        }
    }
}