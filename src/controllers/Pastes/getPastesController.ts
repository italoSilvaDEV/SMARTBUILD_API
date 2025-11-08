import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetPastesController {
    async handle(req: Request, res: Response) {
        const {
            projectId
        } = req.params;

        if (!projectId) {
            return res.status(400).json({
                error: "Project ID is required"
            })
        }

        try {
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

            const pastes = await prisma.projectPastes.findMany({
                where: {
                    projectId: projectId
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