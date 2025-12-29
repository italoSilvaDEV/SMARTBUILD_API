import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { workerAssignmentEmail } from "../../templateEmail/workerAssignment";

interface User {
    id: string
}

interface Subcontractor {
    id: string
}

interface CreateJobProject {
    projectId: string
    companyId: string
    serviceProjectId: string
    users?: User[]
    subcontractors?: Subcontractor[]
    startDate: string
    deadline: string
    skipEmail?: boolean
}

export class CreateJobProjectController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreateJobProject

        try {
            if (!body.projectId
                || !body.companyId
                || !body.serviceProjectId
                || !body.startDate
                || !body.deadline
            ) {
                return res.status(400).json({
                    error: "Project ID, company ID, service project ID, start date and deadline are required"
                })
            }

            if (!body.users && !body.subcontractors) {
                return res.status(400).json({
                    error: "Users or subcontractors are required"
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
                    start_date: true,
                    deadline: true,
                }
            })

            if (!serviceProject) {
                return res.status(404).json({
                    error: "Service project not found"
                })
            }

            const isScheduleChange = !!(serviceProject.start_date && serviceProject.deadline);
            const oldStartDate = serviceProject.start_date;
            const oldDeadline = serviceProject.deadline;

            if (body.users) {
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
            }

            if (body.subcontractors) {
                for (const subcontractor of body.subcontractors) {
                    const subcontractorExists = await prisma.subcontractor.findUnique({
                        where: {
                            id: subcontractor.id,
                            company_id: company.id
                        }
                    })

                    if (!subcontractorExists) {
                        return res.status(404).json({
                            error: "Subcontractor not found"
                        })
                    }

                    const subcontractorServiceProjectExists = await prisma.subContractorServiceProject.findUnique({
                        where: {
                            subcontractor_id_service_project_id: {
                                subcontractor_id: subcontractor.id,
                                service_project_id: serviceProject.id
                            }
                        }
                    })

                    if (!subcontractorServiceProjectExists) {
                        await prisma.subContractorServiceProject.create({
                            data: {
                                subcontractor_id: subcontractor.id,
                                service_project_id: serviceProject.id
                            }
                        })
                    }
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

            const serviceProjectData = await prisma.serviceProject.findUnique({
                where: {
                    id: serviceProject.id
                },
                select: {
                    name: true,
                    start_date: true,
                    deadline: true
                }
            });

            const projectData = await prisma.project.findUnique({
                where: {
                    id: project.id
                },
                select: {
                    location: true,
                    lat: true,
                    log: true,
                    contract_number: true
                }
            });

            const serviceName = serviceProjectData?.name || 'Service';
            const projectLocation = projectData?.location || 'Not specified';
            const latitude = projectData?.lat ? parseFloat(projectData.lat) : null;
            const longitude = projectData?.log ? parseFloat(projectData.log) : null;
            const startDate = serviceProjectData?.start_date || body.startDate;
            const deadline = serviceProjectData?.deadline || body.deadline;

            const allUserServiceProjects = await prisma.userServiceProject.findMany({
                where: {
                    service_project_id: serviceProject.id
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            const allSubcontractorServiceProjects = await prisma.subContractorServiceProject.findMany({
                where: {
                    service_project_id: serviceProject.id
                },
                include: {
                    subcontractor: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            if (!body.skipEmail) {
                try {
                    const SMTP_CONFIG = require("../../config/smtp");
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
                    })

                    const emailSubject = isScheduleChange
                        ? `Schedule Updated - ${serviceName} - #${projectData?.contract_number}`
                        : `New Assignment - ${serviceName} - #${projectData?.contract_number}`;

                    for (const userServiceProject of allUserServiceProjects) {
                        const user = userServiceProject.user;
                        if (user && user.email && user.name) {
                            const emailHtml = workerAssignmentEmail(
                                user.name,
                                serviceName,
                                new Date(startDate).toISOString(),
                                new Date(deadline).toISOString(),
                                projectLocation,
                                user.email,
                                latitude,
                                longitude,
                                isScheduleChange,
                                oldStartDate ? new Date(oldStartDate).toISOString() : undefined,
                                oldDeadline ? new Date(oldDeadline).toISOString() : undefined
                            );

                            await transporter.sendMail({
                                from: SMTP_CONFIG.user,
                                to: "rian.goncallves@gmail.com",
                                subject: emailSubject,
                                html: emailHtml,
                                text: `Hello ${user.name},\n\n${isScheduleChange ? 'The schedule has been updated' : 'You have been assigned'} to the following service: ${serviceName}\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                            });
                        }
                    }

                    for (const subcontractorServiceProject of allSubcontractorServiceProjects) {
                        const subcontractor = subcontractorServiceProject.subcontractor;
                        if (subcontractor && subcontractor.email && subcontractor.name) {
                            const emailHtml = workerAssignmentEmail(
                                subcontractor.name,
                                serviceName,
                                new Date(startDate).toISOString(),
                                new Date(deadline).toISOString(),
                                projectLocation,
                                subcontractor.email,
                                latitude,
                                longitude,
                                isScheduleChange,
                                oldStartDate ? new Date(oldStartDate).toISOString() : undefined,
                                oldDeadline ? new Date(oldDeadline).toISOString() : undefined
                            );

                            await transporter.sendMail({
                                from: SMTP_CONFIG.user,
                                to: "rian.goncallves@gmail.com",
                                subject: emailSubject,
                                html: emailHtml,
                                text: `Hello ${subcontractor.name},\n\n${isScheduleChange ? 'The schedule has been updated' : 'You have been assigned'} to the following service: ${serviceName}\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                            });

                            console.log("Email sent successfully")
                        }
                    }
                } catch (emailError: any) {
                    console.error("Error sending assignment emails:", emailError);
                }
            } else {
                console.log("Email skipped")
            }

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