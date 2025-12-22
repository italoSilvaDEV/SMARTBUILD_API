import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

interface User {
    id: string
}

interface Subcontractor {
    id: string
}


interface CreateCustomService {
    name: string
    description?: string
    start_date: string
    deadline: string
    users?: User[]
    subcontractors?: Subcontractor[]
    projectId: string
    companyId: string
}

export class CreateCustomServiceController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreateCustomService;

        if (!body.projectId
            || !body.companyId
            || !body.name
            || !body.start_date
            || !body.deadline
        ) {
            return res.status(400).json({
                error: "Project ID and company ID are required"
            })
        }

        try {
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

            const customService = await prisma.customServiceSchedule.create({
                data: {
                    name: body.name,
                    description: body.description || null,
                    start_date: body.start_date || null,
                    deadline: body.deadline || null,
                    projectId: project.id,
                }
            })

            if (body.users && body.users.length > 0) {
                for (const user of body.users) {
                    const userExists = await prisma.user.findUnique({
                        where: {
                            id: user.id,
                        }
                    })

                    if (!userExists) {
                        return res.status(404).json({
                            error: "User not found"
                        })
                    }

                    const userServiceProjectExists = await prisma.userServiceProject.findUnique({
                        where: {
                            user_id_custom_service_schedule_id: {
                                user_id: user.id,
                                custom_service_schedule_id: customService.id
                            }
                        }
                    })

                    if (!userServiceProjectExists) {
                        await prisma.userServiceProject.create({
                            data: {
                                user_id: user.id,
                                custom_service_schedule_id: customService.id
                            }
                        })
                    }
                }
            }

            if (body.subcontractors && body.subcontractors.length > 0) {
                for (const subcontractor of body.subcontractors) {
                    const subcontractorExists = await prisma.subcontractor.findUnique({
                        where: {
                            id: subcontractor.id,
                        }
                    })

                    if (!subcontractorExists) {
                        return res.status(404).json({
                            error: "Subcontractor not found"
                        })
                    }

                    const subcontractorServiceProjectExists = await prisma.subContractorServiceProject.findUnique({
                        where: {
                            subcontractor_id_custom_service_schedule_id: {
                                subcontractor_id: subcontractor.id,
                                custom_service_schedule_id: customService.id
                            }
                        }
                    })

                    if (!subcontractorServiceProjectExists) {
                        await prisma.subContractorServiceProject.create({
                            data: {
                                subcontractor_id: subcontractor.id,
                                custom_service_schedule_id: customService.id
                            }
                        })
                    }
                }
            }

            return res.status(201).json({
                message: "Custom service created successfully",
                data: customService
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}