import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DeleteEstimateController {
    async handle(req: Request, res: Response) {
        const {
            estimateId
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
            await prisma.estimate.delete({
                where: {
                    id: estimateId
                }
            })

            return res.status(200).json({
                message: "Estimate deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while deleting estimate"
            })
        }
    }
}