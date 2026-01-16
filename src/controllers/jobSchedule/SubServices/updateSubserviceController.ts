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

interface UpdateSubservice {
    subserviceId: string;
    companyId: string;
    name?: string;
    description?: string;
    startDate?: string;
    deadline?: string;
    users?: UserInput[];
    subcontractors?: SubcontractorInput[];
}

export class UpdateSubserviceController {
    async handle(req: Request, res: Response) {
        const body = req.body as UpdateSubservice;

        try {
            if (!body.subserviceId || !body.companyId) {
                return res.status(400).json({ error: "Subservice ID and Company ID are required" });
            }

            const company = await prisma.company.findUnique({
                where: { id: body.companyId },
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const subservice = await prisma.subServicesProject.findUnique({
                where: { id: body.subserviceId },
                include: {
                    serviceProject: {
                        include: {
                            Project: { include: { client: true, workContext: true } }
                        }
                    },
                    custom_service_schedule: {
                        include: {
                            project: { include: { client: true, workContext: true } }
                        }
                    },
                    userServiceProject: { include: { user: true } },
                    subContractorServiceProjects: { include: { subcontractor: true } }
                }
            });

            if (!subservice) return res.status(404).json({ error: "Subservice not found" });

            const project = subservice.serviceProject?.Project || subservice.custom_service_schedule?.project;
            if (!project) return res.status(404).json({ error: "Project context not found" });

            const changes: ScheduleChange[] = [];
            const dateChanged = (body.startDate && body.startDate !== subservice.start_date) ||
                (body.deadline && body.deadline !== subservice.deadline);

            if (body.name && body.name !== subservice.name) {
                changes.push({ label: "Name", oldValue: subservice.name, newValue: body.name });
            }

            if (body.startDate && body.startDate !== subservice.start_date) {
                changes.push({ label: "Start Date", oldValue: subservice.start_date || 'Not set', newValue: body.startDate });
            }

            if (body.deadline && body.deadline !== subservice.deadline) {
                changes.push({ label: "Deadline", oldValue: subservice.deadline || 'Not set', newValue: body.deadline });
            }

            if (body.description && body.description !== subservice.description) {
                changes.push({ label: "Description", newValue: "Description has been updated" });
            }

            // Workers logic
            const currentWorkerIds = subservice.userServiceProject.map(usp => usp.user_id);
            const newWorkerIds = body.users?.map(u => u.id) || currentWorkerIds;
            const workersToRemove = currentWorkerIds.filter(id => !newWorkerIds.includes(id));
            const workersToAdd = newWorkerIds.filter(id => !currentWorkerIds.includes(id));

            const currentSubIds = subservice.subContractorServiceProjects.map(s => s.subcontractor_id);
            const newSubIds = body.subcontractors?.map(s => s.id) || currentSubIds;
            const subsToRemove = currentSubIds.filter(id => !newSubIds.includes(id));
            const subsToAdd = newSubIds.filter(id => !currentSubIds.includes(id));

            await prisma.$transaction([
                prisma.subServicesProject.update({
                    where: { id: body.subserviceId },
                    data: {
                        name: body.name,
                        description: body.description,
                        start_date: body.startDate,
                        deadline: body.deadline
                    }
                }),
                prisma.userServiceProject.deleteMany({
                    where: { sub_service_project_id: body.subserviceId, user_id: { in: workersToRemove } }
                }),
                ...workersToAdd.map(id => prisma.userServiceProject.create({
                    data: { sub_service_project_id: body.subserviceId, user_id: id }
                })),
                prisma.subContractorServiceProject.deleteMany({
                    where: { sub_service_project_id: body.subserviceId, subcontractor_id: { in: subsToRemove } }
                }),
                ...subsToAdd.map(id => prisma.subContractorServiceProject.create({
                    data: { sub_service_project_id: body.subserviceId, subcontractor_id: id }
                }))
            ]);

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

            const clientEmail = project.workContext?.Email || project.client?.email;
            const clientName = project.workContext?.Name || project.client?.name;

            if (clientEmail && clientName) {
                await transporter.sendMail({
                    from: SMTP_CONFIG.user,
                    to: clientEmail,
                    subject: `Update: Subservice Schedule - #${contractNumber}`,
                    html: jobScheduleGlobalTemplate(
                        clientName, body.name || subservice.name, contractNumber, projectLocation, 'UPDATED', changes,
                        companyLogo, company.name, company.phone || undefined, company.email || undefined,
                        body.startDate || subservice.start_date || undefined,
                        body.deadline || subservice.deadline || undefined,
                        body.description || subservice.description || undefined
                    )
                });
            }

            for (const workerId of workersToAdd) {
                const worker = await prisma.user.findUnique({ where: { id: workerId } });
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `New Assignment: ${body.name || subservice.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, body.name || subservice.name, contractNumber, projectLocation, 'ASSIGNED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined,
                            body.startDate || subservice.start_date || undefined,
                            body.deadline || subservice.deadline || undefined
                        )
                    });
                }
            }

            for (const workerId of workersToRemove) {
                const worker = subservice.userServiceProject.find(usp => usp.user_id === workerId)?.user;
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `Assignment Removed: ${subservice.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, subservice.name, contractNumber, projectLocation, 'REMOVED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
                    });
                }
            }

            if (dateChanged) {
                const remainingWorkerIds = currentWorkerIds.filter(id => !workersToRemove.includes(id));
                for (const workerId of remainingWorkerIds) {
                    const worker = subservice.userServiceProject.find(usp => usp.user_id === workerId)?.user;
                    if (worker?.email) {
                        await transporter.sendMail({
                            from: SMTP_CONFIG.user,
                            to: worker.email,
                            subject: `Schedule Update: ${body.name || subservice.name}`,
                            html: jobScheduleGlobalTemplate(
                                worker.name, body.name || subservice.name, contractNumber, projectLocation, 'UPDATED', changes,
                                companyLogo, company.name, company.phone || undefined, company.email || undefined,
                                body.startDate || subservice.start_date || undefined,
                                body.deadline || subservice.deadline || undefined
                            )
                        });
                    }
                }
            }

            for (const subId of subsToAdd) {
                const subcontractor = await prisma.subcontractor.findUnique({ where: { id: subId } });
                if (subcontractor?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: subcontractor.email,
                        subject: `New Assignment: ${body.name || subservice.name}`,
                        html: jobScheduleGlobalTemplate(
                            subcontractor.name, body.name || subservice.name, contractNumber, projectLocation, 'ASSIGNED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined,
                            body.startDate || subservice.start_date || undefined,
                            body.deadline || subservice.deadline || undefined
                        )
                    });
                }
            }

            for (const subId of subsToRemove) {
                const sub = subservice.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                if (sub?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: sub.email,
                        subject: `Assignment Removed: ${subservice.name}`,
                        html: jobScheduleGlobalTemplate(
                            sub.name, subservice.name, contractNumber, projectLocation, 'REMOVED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
                    });
                }
            }

            if (dateChanged) {
                const remainingSubIds = currentSubIds.filter(id => !subsToRemove.includes(id));
                for (const subId of remainingSubIds) {
                    const sub = subservice.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                    if (sub?.email) {
                        await transporter.sendMail({
                            from: SMTP_CONFIG.user,
                            to: sub.email,
                            subject: `Schedule Update: ${body.name || subservice.name}`,
                            html: jobScheduleGlobalTemplate(
                                sub.name, body.name || subservice.name, contractNumber, projectLocation, 'UPDATED', changes,
                                companyLogo, company.name, company.phone || undefined, company.email || undefined,
                                body.startDate || subservice.start_date || undefined,
                                body.deadline || subservice.deadline || undefined
                            )
                        });
                    }
                }
            }

            return res.status(200).json({ message: "Subservice updated successfully" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
