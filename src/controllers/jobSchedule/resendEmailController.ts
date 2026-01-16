import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate } from "../../templateEmail/jobScheduleGlobalTemplate";
import { sendEmail } from "../../utils/sendEmail";

export class ResendEmailController {
    async forServiceProject(req: Request, res: Response) {
        const { id } = req.params;
        const { to } = req.body;

        if (!to) {
            return res.status(400).json({ error: "Recipient emails (to) are required" });
        }

        const emails = to.split(",").map((email: string) => email.trim());

        try {
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id },
                include: {
                    Project: {
                        select: {
                            location: true,
                            contract_number: true,
                            company_id: true,
                            lat: true, // Adicionado
                            log: true  // Adicionado
                        }
                    }
                }
            });

            if (!serviceProject) {
                return res.status(404).json({ error: "Service project not found" });
            }

            const company = await prisma.company.findUnique({
                where: { id: serviceProject.Project?.company_id || "" },
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const startDate = serviceProject.start_date;
            const deadline = serviceProject.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Service project has no schedule" });
            }

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = serviceProject.Project?.location || 'Not specified';
            const contractNumber = serviceProject.Project?.contract_number || 'N/A';
            const latitude = serviceProject.Project?.lat;
            const longitude = serviceProject.Project?.log;

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

            for (const email of emails) {
                await sendEmail({
                    to: email,
                    templateId: "d-49b79f0499fc469489a09e2a89a6dc19", // Reminder
                    dynamicTemplateData: {
                        recipientName: "Professional",
                        projectName: serviceProject.name,
                        contractNumber: contractNumber,
                        location: projectLocation,
                        googleMapsLink: googleMapsLink, // Nova variável
                        companyName: company.name || "",
                        startDateFormatted: formatSGDate(startDate || undefined),
                        deadlineFormatted: formatSGDate(deadline || undefined),
                        description: serviceProject.description || "",
                        currentYear: new Date().getFullYear().toString(),
                        isReminder: true
                    }
                });
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });

        } catch (error: any) {
            console.error("Error resending service project emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async forSubService(req: Request, res: Response) {
        const { id } = req.params;
        const { to } = req.body;

        if (!to) {
            return res.status(400).json({ error: "Recipient emails (to) are required" });
        }

        const emails = to.split(",").map((email: string) => email.trim());

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
                                    lat: true, // Adicionado
                                    log: true  // Adicionado
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
                                    lat: true, // Adicionado
                                    log: true  // Adicionado
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
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const startDate = subservice.start_date;
            const deadline = subservice.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Subservice has no schedule" });
            }

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || 'Not specified';
            const contractNumber = project.contract_number || 'N/A';
            const latitude = project.lat;
            const longitude = project.log;

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

            for (const email of emails) {
                await sendEmail({
                    to: email,
                    templateId: "d-49b79f0499fc469489a09e2a89a6dc19", // Reminder
                    dynamicTemplateData: {
                        recipientName: "Professional",
                        projectName: subservice.name,
                        contractNumber: contractNumber,
                        location: projectLocation,
                        googleMapsLink: googleMapsLink, // Nova variável
                        companyName: company.name || "",
                        startDateFormatted: formatSGDate(startDate || undefined),
                        deadlineFormatted: formatSGDate(deadline || undefined),
                        description: subservice.description || "",
                        currentYear: new Date().getFullYear().toString(),
                        isReminder: true
                    }
                });
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });

        } catch (error: any) {
            console.error("Error resending subservice emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async forCustomService(req: Request, res: Response) {
        const { id } = req.params;
        const { to } = req.body;

        if (!to) {
            return res.status(400).json({ error: "Recipient emails (to) are required" });
        }

        const emails = to.split(",").map((email: string) => email.trim());

        try {
            const customService = await prisma.customServiceSchedule.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            location: true,
                            contract_number: true,
                            company_id: true,
                            lat: true, // Adicionado
                            log: true  // Adicionado
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
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const startDate = customService.start_date;
            const deadline = customService.deadline;

            if (!startDate || !deadline) {
                return res.status(400).json({ error: "Custom service has no schedule" });
            }

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || 'Not specified';
            const contractNumber = project.contract_number || 'N/A';
            const latitude = project.lat;
            const longitude = project.log;

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

            for (const email of emails) {
                await sendEmail({
                    to: email,
                    templateId: "d-49b79f0499fc469489a09e2a89a6dc19", // Reminder
                    dynamicTemplateData: {
                        recipientName: "Professional",
                        projectName: customService.name,
                        contractNumber: contractNumber,
                        location: projectLocation,
                        googleMapsLink: googleMapsLink, // Nova variável
                        companyName: company.name || "",
                        startDateFormatted: formatSGDate(startDate || undefined),
                        deadlineFormatted: formatSGDate(deadline || undefined),
                        description: customService.description || "",
                        currentYear: new Date().getFullYear().toString(),
                        isReminder: true
                    }
                });
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });
        } catch (error: any) {
            console.error("Error resending custom service emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
