import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetPastesController {
    async handle(req: Request, res: Response) {
        const {
            companyId
        } = req.params;

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
            })
        }

        try {
            const company = await prisma.company.findUnique({
                where: {
                    id: companyId
                }
            })

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                })
            }

            const pastes = await prisma.projectPastes.findMany({
                where: {
                    companyId: companyId
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