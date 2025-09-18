import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class BalanceController {
    async updateBalanceDue(req: Request, res: Response) {
        const {
            estimateId,
        } = req.body

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

        try {
            const totalAmount = estimate.serviceProjects.reduce((total, service) => {
                return total + Number(service.quantity) * Number(service.unitPrice)
            }, 0)

            const totalAmountPaid = Number(estimate.amountPaid) || 0

            const balanceDue = totalAmount - totalAmountPaid

            const balanceUpdate = await prisma.estimate.update({
                where: {
                    id: estimateId
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
            estimateId,
            amountPaid
        } = req.body

        if (!estimateId || !amountPaid) {
            return res.status(400).json({
                error: "Estimate ID and amount paid are required"
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

        try {
            const updateAmountPaid = await prisma.estimate.update({
                where: {
                    id: estimateId
                },
                data: {
                    amountPaid: Number(amountPaid)
                }
            })

            return res.status(200).json({
                message: "Estimate amount paid updated successfully",
                updateAmountPaid
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
} 