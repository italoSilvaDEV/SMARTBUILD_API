import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface User {
    id: string
}

interface CreateJobProject {
    projectId: string
    companyId: string
    serviceProjectId: string
    users: User[]
    startDate: string
    deadline: string
}

export class CreateJobProjectController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreateJobProject

        try {
            if (!body.projectId
                || !body.companyId
                || !body.serviceProjectId
                || !body.users
                || !body.startDate
                || !body.deadline
            ) {
                return res.status(400).json({
                    error: "Project ID, company ID, service project ID, user ID, start date and deadline are required"
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

            const serviceProject = await prisma.serviceProject.findUnique({
                where: {
                    id: body.serviceProjectId,
                    projectId: project.id
                },
                select: {
                    id: true,
                }
            })

            if (!serviceProject) {
                return res.status(404).json({
                    error: "Service project not found"
                })
            }

            for (const user of body.users) {
                const userExists = await prisma.user.findUnique({
                    where: {
                        id: user.id,
                        isDisabled: false,
                        office: {
                            name: "Worker"
                        },
                        companies: {
                            some: {
                                companyId: company.id
                            }
                        }
                    }
                })

                if (!userExists) {
                    return res.status(404).json({
                        error: "User not found"
                    })
                }

                const userServiceProjectExists = await prisma.userServiceProject.findUnique({
                    where: {
                        user_id_service_project_id: {
                            user_id: user.id,
                            service_project_id: serviceProject.id
                        }
                    }
                })

                if (!userServiceProjectExists) {
                    await prisma.userServiceProject.create({
                        data: {
                            user_id: user.id,
                            service_project_id: serviceProject.id,
                            assigned_at: new Date().toISOString()
                        }
                    })
                }
            }

            await prisma.serviceProject.update({
                where: {
                    id: serviceProject.id,
                    projectId: project.id
                },
                data: {
                    start_date: new Date(body.startDate).toISOString(),
                    deadline: new Date(body.deadline).toISOString()
                }
            })

            return res.status(201).json({
                message: "Job created successfully",
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}