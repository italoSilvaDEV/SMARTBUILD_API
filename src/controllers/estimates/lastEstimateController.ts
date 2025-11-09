import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class LastEstimateController {
    async handle(req: Request, res: Response) {
        const {
            companyId,
            projectId
        } = req.params

        if (!companyId || !projectId) {
            return res.status(400).json({
                error: "Company ID and project ID are required"
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

            const project = await prisma.project.findUnique({
                where: {
                    id: projectId,
                    company_id: companyId
                },
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            const lastEstimate = await prisma.estimate.findFirst({
                where: {
                    projectId: projectId
                },
                include: {
                    serviceProjects: true
                },
                orderBy: {
                    date_creation: "desc"
                }
            })

            return res.status(200).json({
                lastEstimate
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}