import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";

export class ConvertToProjectController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
        } = req.body

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
                projectId: true,
                serviceProjects: true,
                project: {
                    select: {
                        company_id: true,
                        status_project: true
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        if (!estimate.projectId || !estimate.project || !estimate.project.company_id) {
            return res.status(400).json({
                error: "Estimate has no project or company"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                await smartbuild.project.update({
                    where: {
                        id: estimate.projectId
                    },
                    data: {
                        status_project: "Pre-Start"
                    }
                })

                if (estimate.serviceProjects.length > 0) {
                    await smartbuild.serviceProject.createMany({
                        data: estimate.serviceProjects.map((service) => ({
                            name: service.name,
                            description: service.description || "",
                            hours: service.hours || 0,
                            price: service.price || 0,
                            id_service: service.id_service || null,
                            projectId: estimate.projectId,
                            company_id: estimate.project.company_id
                        }))
                    })
                }
            })

            return res.status(200).json({
                message: "Estimate converted to project successfully"
            })

        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while converting estimate to project"
            })
        }
    }
}