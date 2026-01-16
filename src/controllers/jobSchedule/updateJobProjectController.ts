import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate, ScheduleChange } from "../../templateEmail/jobScheduleGlobalTemplate";

interface UserInput {
    id: string;
}

interface SubcontractorInput {
    id: string;
}

interface UpdateJobProject {
    projectId: string;
    companyId: string;
    serviceProjectId: string;
    startDate?: string;
    deadline?: string;
    description?: string;
    users?: UserInput[];
    subcontractors?: SubcontractorInput[];
}

export class UpdateJobProjectController {
    async handle(req: Request, res: Response) {
        const body = req.body as UpdateJobProject;

        try {
            if (!body.projectId || !body.companyId || !body.serviceProjectId) {
                return res.status(400).json({
                    error: "Project ID, Company ID, and Service Project ID are required"
                });
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: body.companyId
                },
                select: {
                    name: true,
                    avatar: true,
                    phone: true,
                    email: true
                }
            });

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                });
            }


            const serviceProject = await prisma.serviceProject.findUnique({
                where: {
                    id: body.serviceProjectId
                },
                include: {
                    Project: {
                        include: {
                            client: true,
                            workContext: true
                        }
                    },
                    UserServiceProject: {
                        include: {
                            user: true
                        }
                    },
                    subContractorServiceProjects: {
                        include: {
                            subcontractor: true
                        }
                    }
                }
            });

            if (!serviceProject) return res.status(404).json({
                error: "Service project not found"
            });

            const changes: ScheduleChange[] = [];
            const dateChanged = (body.startDate && body.startDate !== serviceProject.start_date) ||
                (body.deadline && body.deadline !== serviceProject.deadline);

            if (body.startDate && body.startDate !== serviceProject.start_date) {
                changes.push({
                    label: "Start Date",
                    oldValue: serviceProject.start_date || 'Not set',
                    newValue: body.startDate
                });
            }

            if (body.deadline && body.deadline !== serviceProject.deadline) {
                changes.push({
                    label: "Deadline",
                    oldValue: serviceProject.deadline || 'Not set',
                    newValue: body.deadline
                });
            }

            if (body.description && body.description !== serviceProject.description) {
                changes.push({
                    label: "Description",
                    newValue: "Description has been updated"
                });
            }

            const currentWorkerIds = serviceProject.UserServiceProject.map(usp => usp.user_id);
            const newWorkerIds = body.users?.map(u => u.id) || currentWorkerIds;

            const workersToRemove = currentWorkerIds.filter(id => !newWorkerIds.includes(id));
            const workersToAdd = newWorkerIds.filter(id => !currentWorkerIds.includes(id));

            const currentSubIds = serviceProject.subContractorServiceProjects.map(s => s.subcontractor_id);
            const newSubIds = body.subcontractors?.map(s => s.id) || currentSubIds;

            const subsToRemove = currentSubIds.filter(id => !newSubIds.includes(id));
            const subsToAdd = newSubIds.filter(id => !currentSubIds.includes(id));

            await prisma.$transaction([
                prisma.serviceProject.update({
                    where: { id: body.serviceProjectId },
                    data: {
                        start_date: body.startDate,
                        deadline: body.deadline,
                        description: body.description
                    }
                }),
                prisma.userServiceProject.deleteMany({
                    where: {
                        service_project_id: body.serviceProjectId,
                        user_id: { in: workersToRemove }
                    }
                }),
                ...workersToAdd.map(id => prisma.userServiceProject.create({
                    data: { service_project_id: body.serviceProjectId, user_id: id }
                })),
                prisma.subContractorServiceProject.deleteMany({
                    where: {
                        service_project_id: body.serviceProjectId,
                        subcontractor_id: { in: subsToRemove }
                    }
                }),
                ...subsToAdd.map(id => prisma.subContractorServiceProject.create({
                    data: { service_project_id: body.serviceProjectId, subcontractor_id: id }
                }))
            ]);

            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false }
            });

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = serviceProject.Project?.location || "Not specified";
            const contractNumber = serviceProject.Project?.contract_number || "N/A";

            const clientEmail = serviceProject.Project?.workContext?.Email || serviceProject.Project?.client?.email;
            const clientName = serviceProject.Project?.workContext?.Name || serviceProject.Project?.client?.name;

            if (clientEmail && clientName) {
                await transporter.sendMail({
                    from: SMTP_CONFIG.user,
                    to: clientEmail,
                    subject: `Update: Project Schedule - #${contractNumber}`,
                    html: jobScheduleGlobalTemplate(
                        clientName,
                        serviceProject.name,
                        contractNumber,
                        projectLocation,
                        'UPDATED',
                        changes,
                        companyLogo,
                        company.name,
                        company.phone || undefined,
                        company.email || undefined,
                        body.startDate || serviceProject.start_date || undefined,
                        body.deadline || serviceProject.deadline || undefined,
                        body.description || serviceProject.description
                    )
                });
            }

            for (const workerId of workersToAdd) {
                const worker = await prisma.user.findUnique({ where: { id: workerId } });
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `New Assignment: ${serviceProject.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, serviceProject.name, contractNumber, projectLocation, 'ASSIGNED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined,
                            body.startDate || serviceProject.start_date || undefined,
                            body.deadline || serviceProject.deadline || undefined
                        )
                    });
                }
            }

            for (const workerId of workersToRemove) {
                const worker = serviceProject.UserServiceProject.find(usp => usp.user_id === workerId)?.user;
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `Assignment Removed: ${serviceProject.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, serviceProject.name, contractNumber, projectLocation, 'REMOVED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
                    });
                }
            }

            if (dateChanged) {
                const remainingWorkerIds = currentWorkerIds.filter(id => !workersToRemove.includes(id));
                for (const workerId of remainingWorkerIds) {
                    const worker = serviceProject.UserServiceProject.find(usp => usp.user_id === workerId)?.user;
                    if (worker?.email) {
                        await transporter.sendMail({
                            from: SMTP_CONFIG.user,
                            to: worker.email,
                            subject: `Schedule Update: ${serviceProject.name}`,
                            html: jobScheduleGlobalTemplate(
                                worker.name, serviceProject.name, contractNumber, projectLocation, 'UPDATED', changes,
                                companyLogo, company.name, company.phone || undefined, company.email || undefined,
                                body.startDate || serviceProject.start_date || undefined,
                                body.deadline || serviceProject.deadline || undefined
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
                        subject: `New Assignment: ${serviceProject.name}`,
                        html: jobScheduleGlobalTemplate(
                            subcontractor.name, serviceProject.name, contractNumber, projectLocation, 'ASSIGNED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined,
                            body.startDate || serviceProject.start_date || undefined,
                            body.deadline || serviceProject.deadline || undefined
                        )
                    });
                }
            }

            for (const subId of subsToRemove) {
                const sub = serviceProject.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                if (sub?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: sub.email,
                        subject: `Assignment Removed: ${serviceProject.name}`,
                        html: jobScheduleGlobalTemplate(
                            sub.name, serviceProject.name, contractNumber, projectLocation, 'REMOVED', [],
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
                    });
                }
            }

            if (dateChanged) {
                const remainingSubIds = currentSubIds.filter(id => !subsToRemove.includes(id));
                for (const subId of remainingSubIds) {
                    const sub = serviceProject.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                    if (sub?.email) {
                        await transporter.sendMail({
                            from: SMTP_CONFIG.user,
                            to: sub.email,
                            subject: `Schedule Update: ${serviceProject.name}`,
                            html: jobScheduleGlobalTemplate(
                                sub.name, serviceProject.name, contractNumber, projectLocation, 'UPDATED', changes,
                                companyLogo, company.name, company.phone || undefined, company.email || undefined,
                                body.startDate || serviceProject.start_date || undefined,
                                body.deadline || serviceProject.deadline || undefined
                            )
                        });
                    }
                }
            }

            return res.status(200).json({ message: "Service project updated successfully" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
