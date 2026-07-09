import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { buildEstimateFinancialFields } from "../../utils/estimateDiscount";

const DISCOUNT_ERRORS = new Set([
    "Percentage markup cannot be greater than 100",
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
    "Percentage deposit cannot be greater than 100",
    "Fixed deposit cannot be greater than estimate total",
]);

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
                    orderBy: [
                        { pos: "asc" },
                        { date_creation: "asc" },
                        { id: "asc" },
                    ],
                    select: {
                        quantity: true,
                        unitPrice: true,
                        lineTotal: true,
                        originalUnitPrice: true,
                        originalLineTotal: true,
                        hours: true,
                        price: true,
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
            const subtotal = estimate.serviceProjects.length > 0
                ? estimate.serviceProjects.reduce((total, service) => {
                    const lineTotal = service.originalLineTotal ?? service.lineTotal ?? (Number(service.quantity ?? service.hours ?? 1) * Number(service.originalUnitPrice ?? service.unitPrice ?? service.price ?? 0));
                    return total + Number(lineTotal)
                }, 0)
                : Number(estimate.totalAmount)

            const financialFields = buildEstimateFinancialFields({
                subtotal,
                amountPaid: estimate.amountPaid,
                markupType: (estimate as any).markupType,
                markupValue: (estimate as any).markupValue,
                discountType: (estimate as any).discountType,
                discountValue: (estimate as any).discountValue,
                depositType: (estimate as any).depositType,
                depositValue: (estimate as any).depositValue,
            })

            const balanceUpdate = await prisma.estimate.update({
                where: {
                    id: estimateId
                },
                data: {
                    totalAmount: financialFields.totalAmount,
                    balanceDue: financialFields.balanceDue,
                    markupType: financialFields.markupType,
                    markupValue: financialFields.markupValue,
                    markupAmount: financialFields.markupAmount,
                    discountType: financialFields.discountType,
                    discountValue: financialFields.discountValue,
                    discountAmount: financialFields.discountAmount,
                    depositType: financialFields.depositType,
                    depositValue: financialFields.depositValue,
                    depositAmount: financialFields.depositAmount,
                    finalAmount: financialFields.finalAmount,
                }
            })

            return res.status(200).json({
                message: "Balance updated successfully",
                balanceUpdate
            })
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

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


