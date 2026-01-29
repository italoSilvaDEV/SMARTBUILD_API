import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ClearUpdateController {
    async handle(req: Request, res: Response) {
        const {
            estimateId
        } = req.params

        try {
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
                    pdf_needs_update: true
                }
            })

            if (!estimate) {
                return res.status(404).json({
                    error: "Estimate not found"
                })
            }

            if (estimate.pdf_needs_update === false) {
                return res.status(400).json({
                    error: "PDF needs update flag is already false"
                })
            }

            const updated = await prisma.estimate.update({
                where: {
                    id: estimate.id
                },
                data: {
                    pdf_needs_update: false
                }
            })

            return res.status(200).json({
                message: "Update cleared successfully",
                data: updated
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while clearing update"
            })
        }
    }
}