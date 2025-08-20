import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class ConvertToProjectController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
            status
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
            include: {
                serviceProjects: true,
                project: {
                    select: {
                        company_id: true
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        try {
            await prisma.project.update({
                where: {
                    id: estimate.projectId
                },
                data: {
                    status_project: status
                }
            })

            await prisma.serviceProject.createMany({
                data: estimate.serviceProjects.map((service) => ({
                    name: service.name,
                    description: service.description || "",
                    hours: service.hours || 0,
                    price: service.price || 0,
                    id_service: service.id_service,
                    projectId: estimate.projectId,
                    company_id: estimate.project.company_id
                }))
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