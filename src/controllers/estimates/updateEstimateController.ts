import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

type Fields = {
    description?: string | null
    terms?: string | null
    totalAmount?: number
    multi_emails?: string | null
    date_creation?: string
}

export class UpdateEstimateFieldsController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
            description,
            terms,
            totalAmount,
            multi_emails,
            date_creation,
        } = req.body

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

        if (description === null && terms === null && multi_emails === null && date_creation === null) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (description !== undefined) {
                campos.description = description
            } else if (description === "") {
                campos.description = null
            }

            if (date_creation !== undefined && date_creation !== null) {
                campos.date_creation = date_creation
            }

            if (terms !== undefined) {
                campos.terms = terms
            } else if (terms === "") {
                campos.terms = null
            }

            if (totalAmount !== undefined) {
                campos.totalAmount = totalAmount
            }

            if (multi_emails !== undefined) {
                campos.multi_emails = multi_emails
            } else if (multi_emails === "") {
                campos.multi_emails = null
            }

            if (estimate.status === "approved") {
                (campos as Record<string, unknown>).assignatureRequired = true
            }

            const updatedEstimate = await prisma.estimate.update({
                where: {
                    id: estimateId
                },
                data: campos
            })

            return res.status(200).json({
                message: "Estimate fields updated successfully",
                data: updatedEstimate
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while updating estimate fields"
            })
        }
    }
}