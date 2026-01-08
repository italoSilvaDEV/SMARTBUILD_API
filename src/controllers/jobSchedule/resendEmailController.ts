import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { workerAssignmentEmail } from "../../templateEmail/workerAssignment";

const removeHtml = (text: string): string => {
    if (!text) return "";
    return text.replace(/<[^>]*>/g, '').trim();
};

export class ResendEmailController {
    async forServiceProject(req: Request, res: Response) {
        const { id } = req.params;

        try {
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id },
                include: {
                    Project: {
                        select: {
                            location: true,
                            lat: true,
                            log: true,
                            contract_number: true
                        }
                    },
                    UserServiceProject: {
                        include: {
                            user: {
                                select: {
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    },
                    subContractorServiceProjects: {
                        include: {
                            subcontractor: {
                                select: {
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });

            if (!serviceProject) {
                return res.status(404).json({ error: "Service project not found" });
            }

            const serviceName = serviceProject.name;
            const serviceDescription = serviceProject.description ? removeHtml(serviceProject.description) : undefined;
            const projectLocation = serviceProject.Project?.location || 'Not specified';
            const latitude = serviceProject.Project?.lat ? parseFloat(serviceProject.Project.lat) : null;
            const longitude = serviceProject.Project?.log ? parseFloat(serviceProject.Project.log) : null;
            const startDate = serviceProject.start_date;
            const deadline = serviceProject.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Service project has no schedule" });
            }

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
            });

            const emailSubject = `Reminder: Task Details - ${serviceName} - #${serviceProject.Project?.contract_number}`;

            for (const usp of serviceProject.UserServiceProject) {
                if (usp.user?.email && usp.user?.name) {
                    const emailHtml = workerAssignmentEmail(
                        usp.user.name,
                        serviceName,
                        new Date(startDate).toISOString(),
                        new Date(deadline).toISOString(),
                        projectLocation,
                        usp.user.email,
                        latitude,
                        longitude,
                        false,
                        undefined,
                        undefined,
                        serviceDescription,
                        true
                    );

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: usp.user.email,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `Hello ${usp.user.name},\n\nThis is a reminder about your assignment: ${serviceName}.\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                    });
                }
            }

            for (const ssp of serviceProject.subContractorServiceProjects) {
                if (ssp.subcontractor?.email && ssp.subcontractor?.name) {
                    const emailHtml = workerAssignmentEmail(
                        ssp.subcontractor.name,
                        serviceName,
                        new Date(startDate).toISOString(),
                        new Date(deadline).toISOString(),
                        projectLocation,
                        ssp.subcontractor.email,
                        latitude,
                        longitude,
                        false,
                        undefined,
                        undefined,
                        serviceDescription,
                        true
                    );

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: ssp.subcontractor.email,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `Hello ${ssp.subcontractor.name},\n\nThis is a reminder about your assignment: ${serviceName}.\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                    });
                }
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });

        } catch (error: any) {
            console.error("Error resending service project emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async forSubService(req: Request, res: Response) {
        const { id } = req.params;

        try {
            const subservice = await prisma.subServicesProject.findUnique({
                where: { id },
                include: {
                    serviceProject: {
                        include: {
                            Project: {
                                select: {
                                    location: true,
                                    lat: true,
                                    log: true,
                                    contract_number: true
                                }
                            }
                        }
                    },
                    custom_service_schedule: {
                        include: {
                            project: {
                                select: {
                                    location: true,
                                    lat: true,
                                    log: true,
                                    contract_number: true
                                }
                            }
                        }
                    },
                    userServiceProject: {
                        include: {
                            user: {
                                select: {
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    },
                    subContractorServiceProjects: {
                        include: {
                            subcontractor: {
                                select: {
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });

            if (!subservice) {
                return res.status(404).json({ error: "Subservice not found" });
            }

            const project = subservice.serviceProject?.Project || subservice.custom_service_schedule?.project;
            const serviceName = subservice.name;
            const subserviceDescription = subservice.description ? removeHtml(subservice.description) : undefined;
            const projectLocation = project?.location || 'Not specified';
            const latitude = project?.lat ? parseFloat(project.lat) : null;
            const longitude = project?.log ? parseFloat(project.log) : null;
            const startDate = subservice.start_date;
            const deadline = subservice.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Subservice has no schedule" });
            }

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
            });

            const emailSubject = `Reminder: Task Details - ${serviceName} - #${project?.contract_number}`;

            for (const usp of subservice.userServiceProject) {
                if (usp.user?.email && usp.user?.name) {
                    const emailHtml = workerAssignmentEmail(
                        usp.user.name,
                        serviceName,
                        new Date(startDate).toISOString(),
                        new Date(deadline).toISOString(),
                        projectLocation,
                        usp.user.email,
                        latitude,
                        longitude,
                        false,
                        undefined,
                        undefined,
                        subserviceDescription,
                        true
                    );

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: usp.user.email,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `Hello ${usp.user.name},\n\nThis is a reminder about your assignment: ${serviceName}.\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                    });
                }
            }

            for (const ssp of subservice.subContractorServiceProjects) {
                if (ssp.subcontractor?.email && ssp.subcontractor?.name) {
                    const emailHtml = workerAssignmentEmail(
                        ssp.subcontractor.name,
                        serviceName,
                        new Date(startDate).toISOString(),
                        new Date(deadline).toISOString(),
                        projectLocation,
                        ssp.subcontractor.email,
                        latitude,
                        longitude,
                        false,
                        undefined,
                        undefined,
                        subserviceDescription,
                        true
                    );

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: ssp.subcontractor.email,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `Hello ${ssp.subcontractor.name},\n\nThis is a reminder about your assignment: ${serviceName}.\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                    });
                }
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });

        } catch (error: any) {
            console.error("Error resending subservice emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async forCustomService(req: Request, res: Response) {
        const { id } = req.params;

        try {
            const customService = await prisma.customServiceSchedule.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            location: true,
                            lat: true,
                            log: true,
                            contract_number: true
                        }
                    },
                    userServiceProjects: {
                        include: {
                            user: {
                                select: {
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    },
                    subContractorServiceProjects: {
                        include: {
                            subcontractor: {
                                select: {
                                    name: true,
                                    email: true
                                }
                            }
                        }
                    }
                }
            });

            if (!customService) {
                return res.status(404).json({ error: "Custom service not found" });
            }

            const serviceName = customService.name;
            const customServiceDescription = customService.description ? removeHtml(customService.description) : undefined;
            const projectLocation = customService.project?.location || 'Not specified';
            const latitude = customService.project?.lat ? parseFloat(customService.project.lat) : null;
            const longitude = customService.project?.log ? parseFloat(customService.project.log) : null;
            const startDate = customService.start_date;
            const deadline = customService.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Custom service has no schedule" });
            }

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
            });

            const emailSubject = `Reminder: Task Details - ${serviceName} - #${customService.project?.contract_number}`;

            for (const usp of customService.userServiceProjects) {
                if (usp.user?.email && usp.user?.name) {
                    const emailHtml = workerAssignmentEmail(
                        usp.user.name,
                        serviceName,
                        new Date(startDate).toISOString(),
                        new Date(deadline).toISOString(),
                        projectLocation,
                        usp.user.email,
                        latitude,
                        longitude,
                        false,
                        undefined,
                        undefined,
                        customServiceDescription,
                        true
                    );

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: usp.user.email,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `Hello ${usp.user.name},\n\nThis is a reminder about your assignment: ${serviceName}.\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                    });
                }
            }

            for (const ssp of customService.subContractorServiceProjects) {
                if (ssp.subcontractor?.email && ssp.subcontractor?.name) {
                    const emailHtml = workerAssignmentEmail(
                        ssp.subcontractor.name,
                        serviceName,
                        new Date(startDate).toISOString(),
                        new Date(deadline).toISOString(),
                        projectLocation,
                        ssp.subcontractor.email,
                        latitude,
                        longitude,
                        false,
                        undefined,
                        undefined,
                        customServiceDescription,
                        true
                    );

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: ssp.subcontractor.email,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `Hello ${ssp.subcontractor.name},\n\nThis is a reminder about your assignment: ${serviceName}.\n\nStart: ${new Date(startDate).toLocaleDateString()}\nDeadline: ${new Date(deadline).toLocaleDateString()}\nLocation: ${projectLocation}`
                    });
                }
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });
        } catch (error: any) {
            console.error("Error resending custom service emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
