import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import nodemailer from "nodemailer";
import { workerAssignmentEmail } from "../../../templateEmail/workerAssignment";

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
    skipEmail?: boolean
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

            if (!body.skipEmail) {
                try {
                    let projectId: string | null = null;

                    if (body.serviceId) {
                        const service = await prisma.serviceProject.findUnique({
                            where: { id: body.serviceId },
                            select: { projectId: true }
                        });
                        projectId = service?.projectId || null;
                    } else if (body.customServiceId) {
                        const customService = await prisma.customServiceSchedule.findUnique({
                            where: { id: body.customServiceId },
                            select: { projectId: true }
                        });
                        projectId = customService?.projectId || null;
                    }

                    if (projectId) {
                        const projectData = await prisma.project.findUnique({
                            where: { id: projectId },
                            select: {
                                location: true,
                                lat: true,
                                log: true,
                                contract_number: true
                            }
                        });

                        const removeHtml = (text: string): string => {
                            return text.replace(/<[^>]*>/g, '').trim();
                        };

                        const projectLocation = projectData?.location || 'Not specified';
                        const latitude = projectData?.lat ? parseFloat(projectData.lat) : null;
                        const longitude = projectData?.log ? parseFloat(projectData.log) : null;
                        const startDate = subservice.start_date || body.start_date;
                        const deadline = subservice.deadline || body.deadline;
                        const subserviceDescription = subservice.description ? removeHtml(subservice.description) : undefined;

                        const SMTP_CONFIG = require("../../../config/smtp");
                        const transporter = nodemailer.createTransport({
                            host: SMTP_CONFIG.host,
                            port: SMTP_CONFIG.port,
                            secure: SMTP_CONFIG.port === 465,
                            auth: {
                                user: SMTP_CONFIG.user,
                                pass: SMTP_CONFIG.pass,
                            },
                            tls: {
                                rejectUnauthorized: false,
                            },
                        });

                        const emailSubject = `New Assignment - ${subservice.name} - #${projectData?.contract_number}`;

                        const allUserServiceProjects = await prisma.userServiceProject.findMany({
                            where: { sub_service_project_id: subservice.id },
                            include: { user: { select: { name: true, email: true } } }
                        });

                        const allSubcontractorServiceProjects = await prisma.subContractorServiceProject.findMany({
                            where: { sub_service_project_id: subservice.id },
                            include: { subcontractor: { select: { name: true, email: true } } }
                        });

                        for (const usp of allUserServiceProjects) {
                            if (usp.user?.email && usp.user?.name) {
                                const emailHtml = workerAssignmentEmail(
                                    usp.user.name,
                                    subservice.name,
                                    new Date(startDate!).toISOString(),
                                    new Date(deadline!).toISOString(),
                                    projectLocation,
                                    usp.user.email,
                                    latitude,
                                    longitude,
                                    false,
                                    undefined,
                                    undefined,
                                    subserviceDescription
                                );

                                await transporter.sendMail({
                                    from: SMTP_CONFIG.user,
                                    to: usp.user.email,
                                    subject: emailSubject,
                                    html: emailHtml,
                                    text: `Hello ${usp.user.name},\n\nYou have been assigned to the following service: ${subservice.name}\n\nStart: ${new Date(startDate!).toLocaleDateString()}\nDeadline: ${new Date(deadline!).toLocaleDateString()}\nLocation: ${projectLocation}`
                                });
                            }
                        }

                        for (const ssp of allSubcontractorServiceProjects) {
                            if (ssp.subcontractor?.email && ssp.subcontractor?.name) {
                                const emailHtml = workerAssignmentEmail(
                                    ssp.subcontractor.name,
                                    subservice.name,
                                    new Date(startDate!).toISOString(),
                                    new Date(deadline!).toISOString(),
                                    projectLocation,
                                    ssp.subcontractor.email,
                                    latitude,
                                    longitude,
                                    false,
                                    undefined,
                                    undefined,
                                    subserviceDescription
                                );

                                await transporter.sendMail({
                                    from: SMTP_CONFIG.user,
                                    to: ssp.subcontractor.email,
                                    subject: emailSubject,
                                    html: emailHtml,
                                    text: `Hello ${ssp.subcontractor.name},\n\nYou have been assigned to the following service: ${subservice.name}\n\nStart: ${new Date(startDate!).toLocaleDateString()}\nDeadline: ${new Date(deadline!).toLocaleDateString()}\nLocation: ${projectLocation}`
                                });
                            }
                        }
                    }
                } catch (emailError) {
                    console.error('Error sending subservice assignment emails:', emailError);
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