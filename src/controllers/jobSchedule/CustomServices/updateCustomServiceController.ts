import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate, ScheduleChange } from "../../../templateEmail/jobScheduleGlobalTemplate";

interface UserInput {
    id: string;
}

interface SubcontractorInput {
    id: string;
}

interface UpdateCustomService {
    customServiceId: string;
    companyId: string;
    name?: string;
    description?: string;
    startDate?: string;
    deadline?: string;
    users?: UserInput[];
    subcontractors?: SubcontractorInput[];
}

export class UpdateCustomServiceController {
    async handle(req: Request, res: Response) {
        const body = req.body as UpdateCustomService;

        try {
            if (!body.customServiceId || !body.companyId) {
                return res.status(400).json({ error: "Custom Service ID and Company ID are required" });
            }

            const company = await prisma.company.findUnique({
                where: { id: body.companyId },
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const customService = await prisma.customServiceSchedule.findUnique({
                where: { id: body.customServiceId },
                include: {
                    project: { include: { client: true, workContext: true } },
                    userServiceProjects: { include: { user: true } },
                    subContractorServiceProjects: { include: { subcontractor: true } }
                }
            });

            if (!customService) return res.status(404).json({ error: "Custom service not found" });

            const project = customService.project;
            if (!project) return res.status(404).json({ error: "Project not found" });

            const changes: ScheduleChange[] = [];
            const dateChanged = (body.startDate && body.startDate !== customService.start_date) || 
                               (body.deadline && body.deadline !== customService.deadline);

            if (body.name && body.name !== customService.name) {
                changes.push({ label: "Name", oldValue: customService.name, newValue: body.name });
            }

            if (body.startDate && body.startDate !== customService.start_date) {
                changes.push({ label: "Start Date", oldValue: customService.start_date || 'Not set', newValue: body.startDate });
            }

            if (body.deadline && body.deadline !== customService.deadline) {
                changes.push({ label: "Deadline", oldValue: customService.deadline || 'Not set', newValue: body.deadline });
            }

            if (body.description && body.description !== customService.description) {
                changes.push({ label: "Description", newValue: "Description has been updated" });
            }

            // Workers logic
            const currentWorkerIds = customService.userServiceProjects.map(usp => usp.user_id);
            const newWorkerIds = body.users?.map(u => u.id) || currentWorkerIds;
            const workersToRemove = currentWorkerIds.filter(id => !newWorkerIds.includes(id));
            const workersToAdd = newWorkerIds.filter(id => !currentWorkerIds.includes(id));

            // Subcontractors logic
            const currentSubIds = customService.subContractorServiceProjects.map(s => s.subcontractor_id);
            const newSubIds = body.subcontractors?.map(s => s.id) || currentSubIds;
            const subsToRemove = currentSubIds.filter(id => !newSubIds.includes(id));
            const subsToAdd = newSubIds.filter(id => !currentSubIds.includes(id));

            // DB Updates
            await prisma.$transaction([
                prisma.customServiceSchedule.update({
                    where: { id: body.customServiceId },
                    data: {
                        name: body.name,
                        description: body.description,
                        start_date: body.startDate,
                        deadline: body.deadline
                    }
                }),
                prisma.userServiceProject.deleteMany({
                    where: { custom_service_schedule_id: body.customServiceId, user_id: { in: workersToRemove } }
                }),
                ...workersToAdd.map(id => prisma.userServiceProject.create({
                    data: { custom_service_schedule_id: body.customServiceId, user_id: id }
                })),
                prisma.subContractorServiceProject.deleteMany({
                    where: { custom_service_schedule_id: body.customServiceId, subcontractor_id: { in: subsToRemove } }
                }),
                ...subsToAdd.map(id => prisma.subContractorServiceProject.create({
                    data: { custom_service_schedule_id: body.customServiceId, subcontractor_id: id }
                }))
            ]);

            // Email Logic
            const SMTP_CONFIG = require("../../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false }
            });

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || "Not specified";
            const contractNumber = project.contract_number || "N/A";

            // 1. Notify Client
            const clientEmail = project.workContext?.Email || project.client?.email;
            const clientName = project.workContext?.Name || project.client?.name;

            if (clientEmail && clientName) {
                await transporter.sendMail({
                    from: SMTP_CONFIG.user,
                    to: clientEmail,
                    subject: `Update: Custom Service Schedule - #${contractNumber}`,
                    html: jobScheduleGlobalTemplate(
                        clientName, body.name || customService.name, contractNumber, projectLocation, 'UPDATED', changes,
                        companyLogo, company.name, company.phone || undefined, company.email || undefined,
                        body.startDate || customService.start_date || undefined,
                        body.deadline || customService.deadline || undefined,
                        body.description || customService.description || undefined
                    )
                });
            }

            // 2. Notify Workers
            for (const workerId of workersToAdd) {
                const worker = await prisma.user.findUnique({ where: { id: workerId } });
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `New Assignment: ${body.name || customService.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, body.name || customService.name, contractNumber, projectLocation, 'ASSIGNED', [], 
                            companyLogo, company.name, company.phone || undefined, company.email || undefined,
                            body.startDate || customService.start_date || undefined,
                            body.deadline || customService.deadline || undefined
                        )
                    });
                }
            }

            for (const workerId of workersToRemove) {
                const worker = customService.userServiceProjects.find(usp => usp.user_id === workerId)?.user;
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `Assignment Removed: ${customService.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, customService.name, contractNumber, projectLocation, 'REMOVED', [], 
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
                    });
                }
            }

            if (dateChanged) {
                const remainingWorkerIds = currentWorkerIds.filter(id => !workersToRemove.includes(id));
                for (const workerId of remainingWorkerIds) {
                    const worker = customService.userServiceProjects.find(usp => usp.user_id === workerId)?.user;
                    if (worker?.email) {
                        await transporter.sendMail({
                            from: SMTP_CONFIG.user,
                            to: worker.email,
                            subject: `Schedule Update: ${body.name || customService.name}`,
                            html: jobScheduleGlobalTemplate(
                                worker.name, body.name || customService.name, contractNumber, projectLocation, 'UPDATED', changes,
                                companyLogo, company.name, company.phone || undefined, company.email || undefined,
                                body.startDate || customService.start_date || undefined,
                                body.deadline || customService.deadline || undefined
                            )
                        });
                    }
                }
            }

            return res.status(200).json({ message: "Custom service updated successfully" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
