import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class CreatePasteController {
    async handle(req: Request, res: Response) {
        const {
            name,
            userId,
            projectId,
            companyId
        } = req.body

        if (!name || !userId || !projectId || !companyId) {
            return res.status(400).json({
                error: "Name, userId, projectId and companyId are required"
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

        const project = await prisma.project.findUnique({
            where: {
                id: projectId
            }
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
            })
        }

        try {
            const newPaste = await prisma.projectPastes.create({
                data: {
                    name,
                    userAuthorId: userId,
                    projectId: projectId,
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