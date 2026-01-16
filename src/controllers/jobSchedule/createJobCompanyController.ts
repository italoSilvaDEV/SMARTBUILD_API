import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";

interface CreateSchedule {
    companyId: string
    projectId: string
    startDate: string
    deadline: string
    skipEmail?: boolean
}

export class CreateJobCompanyController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreateSchedule

        try {
            if (!body.companyId
                || !body.projectId
                || !body.startDate
                || !body.deadline
            ) {
                return res.status(400).json({
                    error: "Company ID, project ID, start date and deadline are required"
                })
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: body.companyId
                },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    phone: true,
                    email: true,
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
                    start_date: true,
                    contract_number: true,
                    deadline: true,
                    location: true,
                    lat: true, // Adicionado
                    log: true, // Adicionado
                    workContext: {
                        select: {
                            Name: true,
                            Email: true,
                            location: true,
                        }
                    },
                    client: {
                        select: {
                            name: true,
                            email: true,
                            location: true,
                        }
                    }
                }
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found or not belongs to the company"
                })
            }

            const startDate = new Date(body.startDate)
            const deadline = new Date(body.deadline)

            const hadPreviousSchedule = !!(project.start_date && project.deadline)
            const oldStartDate = project.start_date
            const oldDeadline = project.deadline

            const updatedProject = await prisma.project.update({
                where: {
                    id: project.id,
                    company_id: company.id
                },
                data: {
                    start_date: startDate.toISOString(),
                    deadline: deadline.toISOString()
                }
            })

            if (!body.skipEmail) {
                try {
                    const clientName = project.workContext?.Name || project.client?.name
                    const clientEmail = project.workContext?.Email || project.client?.email

                    if (clientEmail && clientName) {
                        const projectLocation = project.location || "Not specified";
                        const latitude = project.lat;
                        const longitude = project.log;

                        const googleMapsLink = (latitude && longitude)
                            ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

                        const formatSGDate = (date?: string | Date) => {
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
                            projectName: "General Project Schedule",
                            contractNumber: project.contract_number || "N/A",
                            location: projectLocation,
                            googleMapsLink: googleMapsLink, // Adicionado
                            companyName: company.name || "",
                            startDateFormatted: formatSGDate(startDate),
                            deadlineFormatted: formatSGDate(deadline),
                            currentYear: new Date().getFullYear().toString(),
                        };

                        await sendEmail({
                            to: clientEmail,
                            templateId: hadPreviousSchedule
                                ? "d-269bc2b469934e85b3e437fd98e0fcd4" // Updated
                                : "d-c2235cb8340643d3b7e9745773f47e01", // Assigned
                            dynamicTemplateData: {
                                ...commonDynamicData,
                                recipientName: clientName,
                                changes: hadPreviousSchedule ? [
                                    { label: "Start Date", oldValue: formatSGDate(oldStartDate || undefined), newValue: formatSGDate(startDate) },
                                    { label: "Deadline", oldValue: formatSGDate(oldDeadline || undefined), newValue: formatSGDate(deadline) }
                                ] : []
                            }
                        });

                        console.log("Email sent successfully")
                    }
                } catch (emailError: any) {
                    console.error("Error sending project schedule email:", emailError);
                }
            }

            return res.status(200).json({
                message: "Job created successfully",
                data: updatedProject
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}