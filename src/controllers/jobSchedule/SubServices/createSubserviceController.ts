import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

interface User {
    id: string
}

interface CreateSubserviceRequest {
    name: string
    description?: string
    serviceId: string
    start_date?: string
    deadline?: string
    price?: number
    users: User[]
}

export class CreateSubserviceController {
    async handle(req: Request, res: Response) {
        try {
            const body = req.body as CreateSubserviceRequest;

            if (!body.name
                || !body.start_date
                || !body.deadline
                || !body.serviceId
            ) {
                return res.status(400).json({
                    error: "Name, start_date, deadline and serviceId are required"
                });
            }

            const service = await prisma.service.findUnique({
                where: {
                    id: body.serviceId
                },
                select: {
                    id: true
                }
            })

            if (!service) {
                return res.status(404).json({
                    error: "Service not found"
                });
            }

            const subservice = await prisma.subServicesProject.create({
                data: {
                    name: body.name,
                    description: body.description || null,
                    serviceProjectId: body.serviceId,
                    start_date: body.start_date || null,
                    deadline: body.deadline || null,
                    price: body.price || 0,
                    status: "pending" //pending or completed
                }
            })

            if (body.users.length > 0) {
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

            return res.status(201).json({
                message: "Subservice created successfully",
                data: subservice
            });
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}