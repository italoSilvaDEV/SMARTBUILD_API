import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

type Fields = {
    description?: string | null
    terms?: string | null
}

export class UpdateEstimateFieldsController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
            description,
            terms,
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

        if (!description && !terms) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (description) {
                campos.description = description
            } else if (description === "") {
                campos.description = null
            }
            if (terms) {
                campos.terms = terms
            } else if (terms === "") {
                campos.terms = null
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