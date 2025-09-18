import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class BalanceController {
    async updateBalanceDue(req: Request, res: Response) {
        const {
            projectId,
        } = req.body

        if (!projectId) {
            return res.status(400).json({
                error: "Project ID is required"
            })
        }

        const project = await prisma.project.findUnique({
            where: {
                id: projectId
            },
            include: {
                serviceProject: {
                    select: {
                        hours: true,
                        price: true
                    }
                }
            }
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
            })
        }

        try {
            const totalAmount = project.serviceProject.reduce((total, service) => {
                return total + Number(service.hours) * Number(service.price)
            }, 0)

            const totalAmountPaid = Number(project.amountPaid) || 0

            const balanceDue = totalAmount - totalAmountPaid

            const balanceUpdate = await prisma.project.update({
                where: {
                    id: projectId
                },
                data: {
                    balanceDue: balanceDue
                }
            })

            return res.status(200).json({
                message: "Balance updated successfully",
                balanceUpdate
            })
        } catch (error) {
            res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async updateAmountPaid(req: Request, res: Response) {
        const {
            projectId,
            amountPaid
        } = req.body

        if (!projectId || !amountPaid) {
            return res.status(400).json({
                error: "Project ID and amount paid are required"
            })
        }

        const project = await prisma.project.findUnique({
            where: {
                id: projectId
            }
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
            })
        }

        try {
            const updateAmountPaid = await prisma.project.update({
                where: {
                    id: projectId
                },
                data: {
                    amountPaid: Number(amountPaid)
                }
            })

            return res.status(200).json({
                message: "Amount paid updated successfully",
                updateAmountPaid
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
} 