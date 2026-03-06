import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetSubcontractorPastesController {
    async handle(req: Request, res: Response) {
        const {
            subcontractorId
        } = req.params;

        if (!subcontractorId) {
            return res.status(400).json({
                error: "Subcontractor ID is required"
            })
        }

        try {
            const subcontractor = await prisma.subcontractor.findUnique({
                where: {
                    id: subcontractorId
                }
            })

            if (!subcontractor) {
                return res.status(404).json({
                    error: "Subcontractor not found"
                })
            }

            const pastes = await prisma.subcontractorPastes.findMany({
                where: {
                    subcontractorId: subcontractorId
                }
            })

            return res.status(200).json({
                success: true,
                message: "Pastes fetched successfully",
                data: pastes
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
