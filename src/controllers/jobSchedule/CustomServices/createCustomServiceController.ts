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


interface CreateCustomService {
    name: string
    description?: string
    start_date: string
    deadline: string
    users?: User[]
    subcontractors?: Subcontractor[]
    projectId: string
    companyId: string
    skipEmail?: boolean
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

            if (!body.skipEmail) {
                try {
                    const projectData = await prisma.project.findUnique({
                        where: { id: body.projectId },
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
                    const startDate = customService.start_date || body.start_date;
                    const deadline = customService.deadline || body.deadline;
                    const customServiceDescription = customService.description ? removeHtml(customService.description) : undefined;

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

                    const emailSubject = `New Assignment - ${customService.name} - #${projectData?.contract_number}`;

                    const allUserServiceProjects = await prisma.userServiceProject.findMany({
                        where: { custom_service_schedule_id: customService.id },
                        include: { user: { select: { name: true, email: true } } }
                    });

                    const allSubcontractorServiceProjects = await prisma.subContractorServiceProject.findMany({
                        where: { custom_service_schedule_id: customService.id },
                        include: { subcontractor: { select: { name: true, email: true } } }
                    });

                    for (const usp of allUserServiceProjects) {
                        if (usp.user?.email && usp.user?.name) {
                            const emailHtml = workerAssignmentEmail(
                                usp.user.name,
                                customService.name,
                                new Date(startDate!).toISOString(),
                                new Date(deadline!).toISOString(),
                                projectLocation,
                                usp.user.email,
                                latitude,
                                longitude,
                                false,
                                undefined,
                                undefined,
                                customServiceDescription
                            );

                            await transporter.sendMail({
                                from: SMTP_CONFIG.user,
                                to: usp.user.email,
                                subject: emailSubject,
                                html: emailHtml,
                                text: `Hello ${usp.user.name},\n\nYou have been assigned to the following service: ${customService.name}\n\nStart: ${new Date(startDate!).toLocaleDateString()}\nDeadline: ${new Date(deadline!).toLocaleDateString()}\nLocation: ${projectLocation}`
                            });
                        }
                    }

                    for (const ssp of allSubcontractorServiceProjects) {
                        if (ssp.subcontractor?.email && ssp.subcontractor?.name) {
                            const emailHtml = workerAssignmentEmail(
                                ssp.subcontractor.name,
                                customService.name,
                                new Date(startDate!).toISOString(),
                                new Date(deadline!).toISOString(),
                                projectLocation,
                                ssp.subcontractor.email,
                                latitude,
                                longitude,
                                false,
                                undefined,
                                undefined,
                                customServiceDescription
                            );

                            await transporter.sendMail({
                                from: SMTP_CONFIG.user,
                                to: ssp.subcontractor.email,
                                subject: emailSubject,
                                html: emailHtml,
                                text: `Hello ${ssp.subcontractor.name},\n\nYou have been assigned to the following service: ${customService.name}\n\nStart: ${new Date(startDate!).toLocaleDateString()}\nDeadline: ${new Date(deadline!).toLocaleDateString()}\nLocation: ${projectLocation}`
                            });
                        }
                    }
                } catch (emailError) {
                    console.error('Error sending custom service assignment emails:', emailError);
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