import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface CompleteJob {
    companyId: string
    projectId: string
    serviceProjectId: string
    subServiceId: string
    customServiceId: string
}

export class CompleteJobController {
    async handle(req: Request, res: Response) {
        const body = req.body as CompleteJob;

        try {
            if (!body.companyId
                || !body.projectId
            ) {
                return res.status(400).json({
                    error: "Company ID and project ID are required"
                })
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: body.companyId
                },
                select: {
                    id: true,
                }
            })

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                })
            }

            const project = await prisma.project.findUnique({
                where: {
                    id: body.projectId,
                    company_id: company.id
                },
                select: {
                    id: true,
                }
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            if (!body.serviceProjectId && !body.subServiceId && !body.customServiceId) {
                return res.status(400).json({
                    error: "At least one service project ID, sub service ID or custom service ID is required"
                })
            }

            if (body.serviceProjectId) {
                const serviceProject = await prisma.serviceProject.findUnique({
                    where: {
                        id: body.serviceProjectId,
                        projectId: project.id
                    },
                })

                if (!serviceProject) {
                    return res.status(404).json({
                        error: "Service project not found"
                    })
                }

                await prisma.serviceProject.update({
                    where: {
                        id: body.serviceProjectId
                    },
                    data: {
                        scheduleCompleted: true
                    }
                })

                return res.status(200).json({
                    message: "Service project completed successfully",
                    data: serviceProject
                })
            }

            if (body.subServiceId) {
                const subService = await prisma.subServicesProject.findUnique({
                    where: {
                        id: body.subServiceId,
                    },
                })

                if (!subService) {
                    return res.status(404).json({
                        error: "Sub service not found"
                    })
                }

                await prisma.subServicesProject.update({
                    where: {
                        id: body.subServiceId
                    },
                    data: {
                        scheduleCompleted: true
                    }
                })

                return res.status(200).json({
                    message: "Sub service completed successfully",
                    data: subService
                })
            }

            if (body.customServiceId) {
                const customService = await prisma.customServiceSchedule.findUnique({
                    where: {
                        id: body.customServiceId,
                    },
                })

                if (!customService) {
                    return res.status(404).json({
                        error: "Custom service not found"
                    })
                }

                await prisma.customServiceSchedule.update({
                    where: {
                        id: body.customServiceId
                    },
                    data: {
                        scheduleCompleted: true
                    }
                })

                return res.status(200).json({
                    message: "Custom service completed successfully",
                    data: customService
                })
            }
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}