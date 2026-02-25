import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { jobScheduleGlobalTemplate, ScheduleChange } from "../../templateEmail/jobScheduleGlobalTemplate";
import { sendEmail } from "../../utils/sendEmail";
import { SchedulePushNotificationService } from "../../services/SchedulePushNotificationService";
import { normalizeToDateOnly, formatDateForEmail } from "../../utils/dateUtils";

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

            const startDateOnly = body.startDate != null ? normalizeToDateOnly(body.startDate) : undefined;
            const deadlineOnly = body.deadline != null ? normalizeToDateOnly(body.deadline) : undefined;

            const changes: ScheduleChange[] = [];

            if (startDateOnly != null && startDateOnly !== serviceProject.start_date) {
                changes.push({
                    label: "Start Date",
                    oldValue: formatDateForEmail(serviceProject.start_date || undefined),
                    newValue: formatDateForEmail(startDateOnly)
                });
            }

            if (deadlineOnly != null && deadlineOnly !== serviceProject.deadline) {
                changes.push({
                    label: "Deadline",
                    oldValue: formatDateForEmail(serviceProject.deadline || undefined),
                    newValue: formatDateForEmail(deadlineOnly)
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
                        ...(startDateOnly != null && { start_date: startDateOnly }),
                        ...(deadlineOnly != null && { deadline: deadlineOnly }),
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

            const projectLocation = serviceProject.Project?.workContext?.location || serviceProject.Project?.location || "Not specified";
            const contractNumber = serviceProject.Project?.contract_number || "N/A";
            const latitude = serviceProject.Project?.workContext?.latitude?.toString() || serviceProject.Project?.lat;
            const longitude = serviceProject.Project?.workContext?.longitude?.toString() || serviceProject.Project?.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const commonDynamicData = {
                projectName: serviceProject.name,
                contractNumber: contractNumber,
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatDateForEmail(startDateOnly ?? serviceProject.start_date ?? undefined),
                deadlineFormatted: formatDateForEmail(deadlineOnly ?? serviceProject.deadline ?? undefined),
                description: body.description || serviceProject.description || "",
                currentYear: new Date().getFullYear().toString(),
            };

            for (const workerId of workersToAdd) {
                const worker = await prisma.user.findUnique({ where: { id: workerId } });
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-c2235cb8340643d3b7e9745773f47e01",
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: worker.name
                        }
                    });
                }
            }

            for (const workerId of workersToRemove) {
                const worker = serviceProject.UserServiceProject.find(usp => usp.user_id === workerId)?.user;
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-0f0dd1c1ccb242fcb8ffa1f5ba41b425",
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: worker.name
                        }
                    });
                }
            }

            for (const subId of subsToAdd) {
                const subcontractor = await prisma.subcontractor.findUnique({ where: { id: subId } });
                if (subcontractor?.email) {
                    await sendEmail({
                        to: subcontractor.email,
                        templateId: "d-c2235cb8340643d3b7e9745773f47e01",
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: subcontractor.name
                        }
                    });
                }
            }

            for (const subId of subsToRemove) {
                const sub = serviceProject.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                if (sub?.email) {
                    await sendEmail({
                        to: sub.email,
                        templateId: "d-0f0dd1c1ccb242fcb8ffa1f5ba41b425",
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: sub.name
                        }
                    });
                }
            }

            const [workerRecipients, subcontractorRecipients] = await Promise.all([
                prisma.user.findMany({
                    where: { id: { in: newWorkerIds } },
                    select: { email: true }
                }),
                prisma.subcontractor.findMany({
                    where: { id: { in: newSubIds } },
                    select: { email: true }
                })
            ]);

            const recipientEmails = [
                ...workerRecipients.map((u) => u.email),
                ...subcontractorRecipients.map((s) => s.email)
            ].filter(Boolean) as string[];

            await SchedulePushNotificationService.sendToEmails({
                emails: recipientEmails,
                title: "Schedule updated",
                body: `${serviceProject.name || "Service"} schedule was updated.`,
                data: {
                    type: "schedule_updated",
                    projectId: body.projectId,
                    serviceProjectId: body.serviceProjectId,
                    subServiceId: null,
                    customServiceId: null
                }
            });

            return res.status(200).json({ message: "Service project updated successfully" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
