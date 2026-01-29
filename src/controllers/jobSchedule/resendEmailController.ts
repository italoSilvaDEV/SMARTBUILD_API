import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate } from "../../templateEmail/jobScheduleGlobalTemplate";
import { sendEmail } from "../../utils/sendEmail";

export class ResendEmailController {
    async forServiceProject(req: Request, res: Response) {
        const { id } = req.params;
        const { to, attachments, notes, skipEmail, description: bodyDescription } = req.body;

        const removeHtml = (text: string | null): string => {
            if (!text) return "";
            return text.replace(/<[^>]*>/g, '').trim();
        };

        try {
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id },
                include: {
                    Project: {
                        select: {
                            location: true,
                            contract_number: true,
                            company_id: true,
                            lat: true,
                            log: true,
                            workContext: {
                                select: {
                                    location: true,
                                    latitude: true,
                                    longitude: true,
                                    Email: true,
                                    Name: true
                                }
                            },
                            client: {
                                select: {
                                    email: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            });

            if (!serviceProject) {
                return res.status(404).json({ error: "Service project not found" });
            }

            const project = serviceProject.Project;
            if (!project) return res.status(404).json({ error: "Project not found" });

            const company = await prisma.company.findUnique({
                where: { id: project.company_id || "" },
                select: { id: true, name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const startDate = serviceProject.start_date;
            const deadline = serviceProject.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Service project has no schedule" });
            }

            const projectLocation = project.workContext?.location || project.location || 'Not specified';
            const contractNumber = project.contract_number || 'N/A';
            const latitude = project.workContext?.latitude?.toString() || project.lat;
            const longitude = project.workContext?.longitude?.toString() || project.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const formatSGDate = (date?: string) => {
                if (!date) return 'Not set';
                return new Date(date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }) + ' (' + new Date(date).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }) + ')';
            };

            const commonDynamicData = {
                projectName: serviceProject.name,
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(startDate || undefined),
                deadlineFormatted: formatSGDate(deadline || undefined),
                notes: notes || "",
                currentYear: new Date().getFullYear().toString(),
                isReminder: true
            };

            const serviceDescription = bodyDescription ? removeHtml(bodyDescription) : (serviceProject.description ? removeHtml(serviceProject.description) : "");

            // Notify workers/subs from "to" field
            if (to) {
                const emails = to.split(",").map((email: string) => email.trim());

                // Batch fetch names from userCompany and subcontractors
                const [userCompanies, subcontractors] = await Promise.all([
                    prisma.userCompany.findMany({
                        where: {
                            companyId: company.id,
                            user: { email: { in: emails } }
                        },
                        include: {
                            user: { select: { email: true, name: true } }
                        }
                    }),
                    prisma.subcontractor.findMany({
                        where: {
                            company_id: company.id,
                            email: { in: emails }
                        },
                        select: { email: true, name: true }
                    })
                ]);

                const nameMap = new Map<string, string>();
                userCompanies.forEach(uc => {
                    if (uc.user) nameMap.set(uc.user.email, uc.user.name);
                });
                subcontractors.forEach(s => {
                    if (!nameMap.has(s.email)) nameMap.set(s.email, s.name);
                });

                for (const email of emails) {
                    await sendEmail({
                        to: email,
                        templateId: "d-49b79f0499fc469489a09e2a89a6dc19", // Worker Reminder
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: nameMap.get(email) || "Team Member",
                            description: serviceDescription,
                        },
                        attachments: attachments && attachments.length > 0 ? attachments : undefined
                    });
                }
            }

            // Notify client if skipEmail is false
            if (!skipEmail) {
                const clientEmail = project.workContext?.Email || project.client?.email;
                const clientName = project.workContext?.Name || project.client?.name;

                if (clientEmail) {
                    await sendEmail({
                        to: clientEmail,
                        templateId: "d-719d0b2a3cde45e9885cf5ba085d3f27", // Client Reminder
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: clientName || "Customer",
                            contractNumber: contractNumber,
                        },
                        attachments: attachments && attachments.length > 0 ? attachments : undefined
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
        const { to, attachments, notes, skipEmail, description: bodyDescription } = req.body;

        const removeHtml = (text: string | null): string => {
            if (!text) return "";
            return text.replace(/<[^>]*>/g, '').trim();
        };

        try {
            const subservice = await prisma.subServicesProject.findUnique({
                where: { id },
                include: {
                    serviceProject: {
                        include: {
                            Project: {
                                select: {
                                    location: true,
                                    contract_number: true,
                                    company_id: true,
                                    lat: true,
                                    log: true,
                                    workContext: {
                                        select: {
                                            location: true,
                                            latitude: true,
                                            longitude: true,
                                            Email: true,
                                            Name: true
                                        }
                                    },
                                    client: {
                                        select: {
                                            email: true,
                                            name: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    custom_service_schedule: {
                        include: {
                            project: {
                                select: {
                                    location: true,
                                    contract_number: true,
                                    company_id: true,
                                    lat: true,
                                    log: true,
                                    workContext: {
                                        select: {
                                            location: true,
                                            latitude: true,
                                            longitude: true,
                                            Email: true,
                                            Name: true
                                        }
                                    },
                                    client: {
                                        select: {
                                            email: true,
                                            name: true
                                        }
                                    }
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
            if (!project) return res.status(404).json({ error: "Project context not found" });

            const company = await prisma.company.findUnique({
                where: { id: project.company_id || "" },
                select: { id: true, name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const startDate = subservice.start_date;
            const deadline = subservice.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Subservice has no schedule" });
            }

            const projectLocation = project.workContext?.location || project.location || 'Not specified';
            const contractNumber = project.contract_number || 'N/A';
            const latitude = project.workContext?.latitude?.toString() || project.lat;
            const longitude = project.workContext?.longitude?.toString() || project.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const formatSGDate = (date?: string) => {
                if (!date) return 'Not set';
                return new Date(date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }) + ' (' + new Date(date).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }) + ')';
            };

            const commonDynamicData = {
                projectName: subservice.name,
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(startDate || undefined),
                deadlineFormatted: formatSGDate(deadline || undefined),
                notes: notes || "",
                currentYear: new Date().getFullYear().toString(),
                isReminder: true
            };

            const serviceDescription = bodyDescription ? removeHtml(bodyDescription) : (subservice.description ? removeHtml(subservice.description) : "");

            // Notify workers/subs from "to" field
            if (to) {
                const emails = to.split(",").map((email: string) => email.trim());

                // Batch fetch names from userCompany and subcontractors
                const [userCompanies, subcontractors] = await Promise.all([
                    prisma.userCompany.findMany({
                        where: {
                            companyId: company.id,
                            user: { email: { in: emails } }
                        },
                        include: {
                            user: { select: { email: true, name: true } }
                        }
                    }),
                    prisma.subcontractor.findMany({
                        where: {
                            company_id: company.id,
                            email: { in: emails }
                        },
                        select: { email: true, name: true }
                    })
                ]);

                const nameMap = new Map<string, string>();
                userCompanies.forEach(uc => {
                    if (uc.user) nameMap.set(uc.user.email, uc.user.name);
                });
                subcontractors.forEach(s => {
                    if (!nameMap.has(s.email)) nameMap.set(s.email, s.name);
                });

                for (const email of emails) {
                    await sendEmail({
                        to: email,
                        templateId: "d-49b79f0499fc469489a09e2a89a6dc19", // Worker Reminder
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: nameMap.get(email) || "Team Member",
                            description: serviceDescription,
                        },
                        attachments: attachments && attachments.length > 0 ? attachments : undefined
                    });
                }
            }

            // Notify client if skipEmail is false
            if (!skipEmail) {
                const clientEmail = project.workContext?.Email || project.client?.email;
                const clientName = project.workContext?.Name || project.client?.name;

                if (clientEmail) {
                    await sendEmail({
                        to: clientEmail,
                        templateId: "d-719d0b2a3cde45e9885cf5ba085d3f27", // Client Reminder
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: clientName || "Customer",
                            contractNumber: contractNumber,
                        },
                        attachments: attachments && attachments.length > 0 ? attachments : undefined
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
        const { to, attachments, notes, skipEmail, description: bodyDescription } = req.body;

        const removeHtml = (text: string | null): string => {
            if (!text) return "";
            return text.replace(/<[^>]*>/g, '').trim();
        };

        try {
            const customService = await prisma.customServiceSchedule.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            location: true,
                            contract_number: true,
                            company_id: true,
                            lat: true,
                            log: true,
                            workContext: {
                                select: {
                                    location: true,
                                    latitude: true,
                                    longitude: true,
                                    Email: true,
                                    Name: true
                                }
                            },
                            client: {
                                select: {
                                    email: true,
                                    name: true
                                }
                            }
                        }
                    }
                }
            });

            if (!customService) {
                return res.status(404).json({ error: "Custom service not found" });
            }

            const project = customService.project;
            if (!project) return res.status(404).json({ error: "Project context not found" });

            const company = await prisma.company.findUnique({
                where: { id: project.company_id || "" },
                select: { id: true, name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const startDate = customService.start_date;
            const deadline = customService.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Custom service has no schedule" });
            }

            const projectLocation = project.workContext?.location || project.location || 'Not specified';
            const contractNumber = project.contract_number || 'N/A';
            const latitude = project.workContext?.latitude?.toString() || project.lat;
            const longitude = project.workContext?.longitude?.toString() || project.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const formatSGDate = (date?: string) => {
                if (!date) return 'Not set';
                return new Date(date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }) + ' (' + new Date(date).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                }) + ')';
            };

            const commonDynamicData = {
                projectName: customService.name,
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(startDate || undefined),
                deadlineFormatted: formatSGDate(deadline || undefined),
                notes: notes || "",
                currentYear: new Date().getFullYear().toString(),
                isReminder: true
            };

            const serviceDescription = bodyDescription ? removeHtml(bodyDescription) : (customService.description ? removeHtml(customService.description) : "");

            // Notify workers/subs from "to" field
            if (to) {
                const emails = to.split(",").map((email: string) => email.trim());

                // Batch fetch names from userCompany and subcontractors
                const [userCompanies, subcontractors] = await Promise.all([
                    prisma.userCompany.findMany({
                        where: {
                            companyId: company.id,
                            user: { email: { in: emails } }
                        },
                        include: {
                            user: { select: { email: true, name: true } }
                        }
                    }),
                    prisma.subcontractor.findMany({
                        where: {
                            company_id: company.id,
                            email: { in: emails }
                        },
                        select: { email: true, name: true }
                    })
                ]);

                const nameMap = new Map<string, string>();
                userCompanies.forEach(uc => {
                    if (uc.user) nameMap.set(uc.user.email, uc.user.name);
                });
                subcontractors.forEach(s => {
                    if (!nameMap.has(s.email)) nameMap.set(s.email, s.name);
                });

                for (const email of emails) {
                    await sendEmail({
                        to: email,
                        templateId: "d-49b79f0499fc469489a09e2a89a6dc19", // Worker Reminder
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: nameMap.get(email) || "Team Member",
                            description: serviceDescription,
                        },
                        attachments: attachments && attachments.length > 0 ? attachments : undefined
                    });
                }
            }

            // Notify client if skipEmail is false
            if (!skipEmail) {
                const clientEmail = project.workContext?.Email || project.client?.email;
                const clientName = project.workContext?.Name || project.client?.name;

                if (clientEmail) {
                    await sendEmail({
                        to: clientEmail,
                        templateId: "d-719d0b2a3cde45e9885cf5ba085d3f27", // Client Reminder
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: clientName || "Customer",
                            contractNumber: contractNumber,
                        },
                        attachments: attachments && attachments.length > 0 ? attachments : undefined
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
