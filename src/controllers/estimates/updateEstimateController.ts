import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { buildEstimateFinancialFields } from "../../utils/estimateDiscount";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";

type Fields = {
    description?: string | null
    terms?: string | null
    totalAmount?: number
    multi_emails?: string | null
    date_creation?: Date
    discountType?: "fixed" | "percentage" | null
    discountValue?: number | null
}

const DISCOUNT_ERRORS = new Set([
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
    "Discount cannot be greater than the remaining balance",
]);

export class UpdateEstimateFieldsController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
            description,
            terms,
            totalAmount,
            multi_emails,
            date_creation,
            discountType,
            discountValue,
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
                        unitPrice: true,
                        lineTotal: true,
                        originalUnitPrice: true,
                        originalLineTotal: true,
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        const hasAnyField = [description, terms, totalAmount, multi_emails, date_creation, discountType, discountValue]
            .some(value => value !== undefined)

        if (!hasAnyField) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (description !== undefined) {
                campos.description = description === "" ? null : description
            }

            if (date_creation !== undefined && date_creation !== null) {
                campos.date_creation = new Date(date_creation)
            }

            if (terms !== undefined) {
                campos.terms = terms === "" ? null : terms
            }

            if (totalAmount !== undefined) {
                campos.totalAmount = Number(totalAmount)
            }

            if (multi_emails !== undefined) {
                campos.multi_emails = multi_emails === "" ? null : multi_emails
            }

            if (discountType !== undefined) {
                campos.discountType = discountType
            }

            if (discountValue !== undefined) {
                campos.discountValue = discountValue === null || discountValue === "" ? null : Number(discountValue)
            }

            let updatedEstimate: any

            if (estimate.serviceProjects.length > 0) {
                updatedEstimate = await prisma.$transaction(async (smartbuild) => {
                    await smartbuild.estimate.update({
                        where: {
                            id: estimateId
                        },
                        data: {
                            ...(campos.description !== undefined ? { description: campos.description } : {}),
                            ...(campos.terms !== undefined ? { terms: campos.terms } : {}),
                            ...(campos.multi_emails !== undefined ? { multi_emails: campos.multi_emails } : {}),
                            ...(campos.date_creation !== undefined ? { date_creation: campos.date_creation } : {}),
                            ...(campos.discountType !== undefined ? { discountType: campos.discountType } : {}),
                            ...(campos.discountValue !== undefined ? { discountValue: campos.discountValue } : {}),
                        }
                    })

                    await syncEstimateDiscountedServices(smartbuild, estimateId)

                    return smartbuild.estimate.findUnique({
                        where: { id: estimateId }
                    })
                })
            } else {
                const subtotal = campos.totalAmount !== undefined ? campos.totalAmount : Number(estimate.totalAmount)
                const financialFields = buildEstimateFinancialFields({
                    subtotal,
                    amountPaid: estimate.amountPaid,
                    discountType: campos.discountType !== undefined ? campos.discountType : (estimate as any).discountType,
                    discountValue: campos.discountValue !== undefined ? campos.discountValue : (estimate as any).discountValue,
                })

                updatedEstimate = await prisma.estimate.update({
                    where: {
                        id: estimateId
                    },
                    data: {
                        ...(campos.description !== undefined ? { description: campos.description } : {}),
                        ...(campos.terms !== undefined ? { terms: campos.terms } : {}),
                        ...(campos.multi_emails !== undefined ? { multi_emails: campos.multi_emails } : {}),
                        ...(campos.date_creation !== undefined ? { date_creation: campos.date_creation } : {}),
                        totalAmount: financialFields.totalAmount,
                        balanceDue: financialFields.balanceDue,
                        discountType: financialFields.discountType,
                        discountValue: financialFields.discountValue,
                        discountAmount: financialFields.discountAmount,
                        finalAmount: financialFields.finalAmount,
                    }
                })
            }

            return res.status(200).json({
                message: "Estimate fields updated successfully",
                data: updatedEstimate
            })
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

            return res.status(500).json({
                error: "Internal server error while updating estimate fields"
            })
        }
    }
}
