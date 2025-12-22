import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

interface User {
    id: string
}

interface Subcontractor {
    id: string
}

interface CreateSubserviceRequest {
    name: string
    description?: string
    serviceId?: string
    customServiceId?: string
    start_date?: string
    deadline?: string
    price?: number
    users?: User[]
    subcontractors?: Subcontractor[]
}

export class CreateSubserviceController {
    async handle(req: Request, res: Response) {
        try {
            const body = req.body as CreateSubserviceRequest;

            if (!body.name
                || !body.start_date
                || !body.deadline
                || !body.serviceId && !body.customServiceId
            ) {
                return res.status(400).json({
                    error: "Name, start_date, deadline and serviceId or customServiceId are required"
                });
            }

            if (!body.users && !body.subcontractors) {
                return res.status(400).json({
                    error: "Users or subcontractors are required"
                })
            }

            if (body.serviceId) {
                const service = await prisma.serviceProject.findUnique({
                    where: {
                        id: body.serviceId
                    },
                    select: {
                        id: true,
                    }
                })

                if (!service) {
                    return res.status(404).json({
                        error: "Service not found"
                    });
                }
            } else if (body.customServiceId) {
                const customService = await prisma.customServiceSchedule.findUnique({
                    where: {
                        id: body.customServiceId
                    },
                    select: {
                        id: true,
                    }
                })

                if (!customService) {
                    return res.status(404).json({
                        error: "Custom service not found"
                    });
                }
            }

            const subservice = await prisma.subServicesProject.create({
                data: {
                    name: body.name,
                    description: body.description || null,
                    serviceProjectId: body.serviceId || null,
                    custom_service_schedule_id: body.customServiceId || null,
                    start_date: body.start_date || null,
                    deadline: body.deadline || null,
                    quantity: 1,
                    price: body.price || 0,
                    status: "pending" //pending or completed
                }
            })

            if (body.users && body.users.length > 0) {
                for (const user of body.users) {
                    const userExists = await prisma.user.findUnique({
                        where: {
                            id: user.id
                        }
                    })

                    if (!userExists) {
                        return res.status(404).json({
                            error: "User not found"
                        });
                    }

                    const userServiceProjectExists = await prisma.userServiceProject.findUnique({
                        where: {
                            user_id_sub_service_project_id: {
                                user_id: user.id,
                                sub_service_project_id: subservice.id
                            }
                        }
                    })

                    if (!userServiceProjectExists) {
                        await prisma.userServiceProject.create({
                            data: {
                                user_id: user.id,
                                sub_service_project_id: subservice.id
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
                            subcontractor_id_sub_service_project_id: {
                                subcontractor_id: subcontractor.id,
                                sub_service_project_id: subservice.id
                            }
                        }
                    })

                    if (!subcontractorServiceProjectExists) {
                        await prisma.subContractorServiceProject.create({
                            data: {
                                subcontractor_id: subcontractor.id,
                                sub_service_project_id: subservice.id
                            }
                        })
                    }
                }
            }

            return res.status(201).json({
                message: "Subservice created successfully",
                data: subservice
            });
        } catch (error) {
            console.error('Error creating subservice:', error);
            return res.status(500).json({
                error: "Internal server error",
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}