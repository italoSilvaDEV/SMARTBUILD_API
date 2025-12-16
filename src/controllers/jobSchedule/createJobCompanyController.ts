import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { projectScheduleEmail } from "../../templateEmail/projectSchedule";

interface CreateSchedule {
    companyId: string
    projectId: string
    startDate: string
    deadline: string
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

            try {
                const clientName = project.workContext?.Name || project.client?.name
                const clientEmail = project.workContext?.Email || project.client?.email

                if (!clientEmail || !clientName) {
                    console.log("Client email or name not found, skipping email send");
                } else {
                    const companyAvatar = company.avatar
                        ? await getPresignedUrl(company.avatar)
                        : ""

                    const emailSubject = hadPreviousSchedule
                        ? `Project Schedule Updated - Contract ${project.contract_number || 'N/A'}`
                        : `Project Scheduled - Contract ${project.contract_number || 'N/A'}`

                    const emailHtml = projectScheduleEmail(
                        clientName,
                        companyAvatar || "",
                        company.name || '',
                        String(project.contract_number || 'N/A'),
                        project.location || 'Not specified',
                        startDate.toISOString(),
                        deadline.toISOString(),
                        hadPreviousSchedule,
                        oldStartDate ? new Date(oldStartDate).toISOString() : undefined,
                        oldDeadline ? new Date(oldDeadline).toISOString() : undefined,
                        company.phone || undefined,
                        company.email || undefined
                    )

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

                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: clientEmail,
                        subject: emailSubject,
                        html: emailHtml,
                        text: `
                        Dear ${clientName},

                        ${hadPreviousSchedule
                                ? `We wanted to inform you that there has been an update to your project schedule.`
                                : `Great news! Your project has been successfully scheduled and we're excited to get started!`}

                        Project Details:
                        - Contract Number: ${project.contract_number || 'N/A'}
                        - Project Location: ${project.location || 'Not specified'}
                        - Start Date: ${startDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        - Deadline: ${deadline.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}

                        ${hadPreviousSchedule && oldStartDate && oldDeadline ? `
                        Previous Schedule:
                        - Start Date: ${new Date(oldStartDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        - Deadline: ${new Date(oldDeadline).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        ` : ''}

                        If you have any questions or need to discuss any adjustments, please don't hesitate to contact us. We're here to ensure everything runs smoothly.

                        Thank you for your business!
                        ${company.name || ''}`.trim()
                    })
                }
            } catch (emailError: any) {
                console.error("Error sending project schedule email:", emailError);
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