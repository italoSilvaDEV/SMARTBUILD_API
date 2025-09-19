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

    async getAmountPaid(req: Request, res: Response) {
        const {
            estimateId,
        } = req.params

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

        try {
            const invoices = await prisma.invoice.findMany({
                where: {
                    estimateId: estimateId,
                    status: "paid"
                },
                select: {
                    totalAmount: true
                }
            })

            const amountPaid = invoices.reduce((total, invoice) => {
                return total + Number(invoice.totalAmount)
            }, 0)

            return res.status(200).json({
                message: "Estimate amount paid retrieved successfully",
                amountPaid
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
} 