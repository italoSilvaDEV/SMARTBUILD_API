import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";

export class ProjectScheduleController {
    async update(req: Request, res: Response) {
        const { projectId } = req.params;
        const { startDate, deadline, sendEmail: shouldSendEmail } = req.body;

        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    client: true,
                    workContext: true,
                    company: true
                }
            });

            if (!project) {
                return res.status(404).json({ error: "Project not found" });
            }

            const oldStartDate = project.start_date;
            const oldDeadline = project.deadline;

            const updatedProject = await prisma.project.update({
                where: { id: projectId },
                data: {
                    start_date: startDate,
                    deadline: deadline
                }
            });

            if (shouldSendEmail) {
                const clientEmail = project.workContext?.Email || project.client?.email;
                const clientName = project.workContext?.Name || project.client?.name;

                if (clientEmail && clientName) {
                    const company = project.company;
                    const projectLocation = project.workContext?.location || project.location || "Not specified";
                    const contractNumber = project.contract_number || "N/A";
                    const latitude = project.workContext?.latitude?.toString() || project.lat;
                    const longitude = project.workContext?.longitude?.toString() || project.log;

                    const googleMapsLink = (latitude && longitude)
                        ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

                    const formatSGDate = (date?: string | null) => {
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

                    const changes = [];
                    if (startDate !== oldStartDate) {
                        changes.push({
                            label: "Start Date",
                            oldValue: formatSGDate(oldStartDate),
                            newValue: formatSGDate(startDate)
                        });
                    }
                    if (deadline !== oldDeadline) {
                        changes.push({
                            label: "Deadline",
                            oldValue: formatSGDate(oldDeadline),
                            newValue: formatSGDate(deadline)
                        });
                    }

                    await sendEmail({
                        to: clientEmail,
                        templateId: "d-9fcafe83aab641849972ba54ec2e965f",
                        dynamicTemplateData: {
                            recipientName: clientName,
                            projectName: "Contract #" + contractNumber,
                            contractNumber: contractNumber,
                            location: projectLocation,
                            googleMapsLink: googleMapsLink,
                            companyName: company?.name || "",
                            startDateFormatted: formatSGDate(startDate),
                            deadlineFormatted: formatSGDate(deadline),
                            changes: changes,
                            currentYear: new Date().getFullYear().toString(),
                            isUpdate: true
                        }
                    });
                }
            }

            return res.status(200).json({ message: "Project schedule updated successfully", project: updatedProject });

        } catch (error: any) {
            console.error("Error updating project schedule:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async resend(req: Request, res: Response) {
        const { projectId } = req.params;
        const { to, attachments, notes } = req.body;

        if (!to) {
            return res.status(400).json({ error: "Recipient emails (to) are required" });
        }

        const emails = to.split(",").map((email: string) => email.trim());

        try {
            const project = await prisma.project.findUnique({
                where: { id: projectId },
                include: {
                    company: true,
                    workContext: true,
                    client: true,
                }
            });

            if (!project) {
                return res.status(404).json({ error: "Project not found" });
            }

            const projectLocation = project.workContext?.location || project.location || "Not specified";
            const clientName = project.workContext?.Name || project.client?.name;
            const contractNumber = project.contract_number || "N/A";
            const latitude = project.workContext?.latitude?.toString() || project.lat;
            const longitude = project.workContext?.longitude?.toString() || project.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const formatSGDate = (date?: string | null) => {
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
                    templateId: "d-719d0b2a3cde45e9885cf5ba085d3f27", // Reminder Template
                    dynamicTemplateData: {
                        recipientName: clientName || "Customer",
                        projectName: "Contract #" + contractNumber,
                        contractNumber: contractNumber,
                        location: projectLocation,
                        googleMapsLink: googleMapsLink,
                        companyName: project.company?.name || "",
                        startDateFormatted: formatSGDate(project.start_date),
                        deadlineFormatted: formatSGDate(project.deadline),
                        notes: notes || "",
                        currentYear: new Date().getFullYear().toString(),
                        isReminder: true
                    },
                    attachments: attachments && attachments.length > 0 ? attachments : undefined
                });
            }

            return res.status(200).json({ message: "Reminder emails sent successfully" });

        } catch (error: any) {
            console.error("Error resending project schedule emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async delete(req: Request, res: Response) {
        const { projectId } = req.params;

        try {
            await prisma.project.update({
                where: { id: projectId },
                data: {
                    start_date: null,
                    deadline: null
                }
            });

            return res.status(200).json({ message: "Project schedule deleted successfully" });
        } catch (error: any) {
            console.error("Error deleting project schedule:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    async sendEmailUpdated(req: Request, res: Response) {
        const {
            to,
            attachments,
            notes,
            customServiceId,
            subServiceId,
            serviceProjectId,
            changes
        } = req.body;

        if (!to) {
            return res.status(400).json({ error: "Recipient emails (to) are required" });
        }

        try {
            let data: any = null;
            let project: any = null;
            let company: any = null;
            let name = "";
            let startDate = "";
            let deadline = "";
            let recipientName = "";

            if (serviceProjectId) {
                data = await prisma.serviceProject.findUnique({
                    where: { id: serviceProjectId },
                    include: {
                        Project: {
                            include: {
                                company: true,
                                client: true,
                                workContext: true
                            }
                        }
                    }
                });
                if (data) {
                    project = data.Project;
                    company = project?.company;
                    name = data.name;
                    startDate = data.start_date;
                    deadline = data.deadline;
                    recipientName = project?.workContext?.Name || project?.client?.name || "Customer";
                }
            } else if (subServiceId) {
                data = await prisma.subServicesProject.findUnique({
                    where: { id: subServiceId },
                    include: {
                        serviceProject: {
                            include: {
                                Project: {
                                    include: {
                                        company: true,
                                        client: true,
                                        workContext: true
                                    }
                                }
                            }
                        },
                        custom_service_schedule: {
                            include: {
                                project: {
                                    include: {
                                        company: true,
                                        client: true,
                                        workContext: true
                                    }
                                }
                            }
                        }
                    }
                });
                if (data) {
                    project = data.serviceProject?.Project || data.custom_service_schedule?.project;
                    company = project?.company;
                    name = data.name;
                    startDate = data.start_date;
                    deadline = data.deadline;
                    recipientName = project?.workContext?.Name || project?.client?.name || "Customer";
                }
            } else if (customServiceId) {
                data = await prisma.customServiceSchedule.findUnique({
                    where: { id: customServiceId },
                    include: {
                        project: {
                            include: {
                                company: true,
                                client: true,
                                workContext: true
                            }
                        }
                    }
                });
                if (data) {
                    project = data.project;
                    company = project?.company;
                    name = data.name;
                    startDate = data.start_date;
                    deadline = data.deadline;
                    recipientName = project?.workContext?.Name || project?.client?.name || "Customer";
                }
            }

            if (!data || !project) {
                return res.status(404).json({ error: "Service or Project not found" });
            }

            const projectLocation = project.workContext?.location || project.location || "Not specified";
            const latitude = project.workContext?.latitude?.toString() || project.lat;
            const longitude = project.workContext?.longitude?.toString() || project.log;

            const contractNumber = project.contract_number || "N/A";

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const formatSGDate = (date?: string | null) => {
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

            const emails = to.split(",").map((email: string) => email.trim());

            for (const email of emails) {
                await sendEmail({
                    to: email,
                    templateId: "d-f0438829104e4f6fb51a435aecb53365",
                    dynamicTemplateData: {
                        recipientName: recipientName,
                        projectName: name || "Project Update",
                        contractNumber: contractNumber,
                        location: projectLocation,
                        googleMapsLink: googleMapsLink,
                        companyName: company?.name || "SmartBuild",
                        startDateFormatted: formatSGDate(startDate),
                        deadlineFormatted: formatSGDate(deadline),
                        changes: changes || [],
                        notes: notes || "",
                        currentYear: new Date().getFullYear().toString(),
                        isUpdate: true
                    },
                    attachments: attachments && attachments.length > 0 ? attachments : undefined
                });
            }

            return res.status(200).json({ message: "Update emails sent successfully" });
        } catch (error: any) {
            console.error("Error sending update emails:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
