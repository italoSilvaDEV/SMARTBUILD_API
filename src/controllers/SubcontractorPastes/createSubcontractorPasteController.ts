import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreateSubcontractorPasteController {
    async handle(req: Request, res: Response) {
        const {
            name,
            userId,
            subcontractorId,
            companyId
        } = req.body

        if (!name || !userId || !subcontractorId || !companyId) {
            return res.status(400).json({
                error: "Name, userId, subcontractorId and companyId are required"
            });
        }

        const user = await prisma.user.findUnique({
            where: {
                id: userId
            }
        })

        if (!user) {
            return res.status(404).json({
                error: "User not found"
            })
        }

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

        try {
            const newPaste = await prisma.subcontractorPastes.create({
                data: {
                    name,
                    userAuthorId: userId,
                    subcontractorId: subcontractorId,
                    companyId: companyId
                }
            })

            return res.status(201).json({
                success: true,
                message: "Paste created successfully",
                data: newPaste
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
