import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate, ScheduleChange } from "../../../templateEmail/jobScheduleGlobalTemplate";
import { sendEmail } from "../../../utils/sendEmail";

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

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || "Not specified";
            const contractNumber = project.contract_number || "N/A";

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
                projectName: body.name || subservice.name,
                contractNumber: contractNumber,
                location: projectLocation,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(body.startDate || subservice.start_date || undefined),
                deadlineFormatted: formatSGDate(body.deadline || subservice.deadline || undefined),
                description: body.description || subservice.description || "",
                currentYear: new Date().getFullYear().toString(),
            };

            const clientEmail = project.workContext?.Email || project.client?.email;
            const clientName = project.workContext?.Name || project.client?.name;

            if (clientEmail && clientName) {
                await sendEmail({
                    to: clientEmail,
                    templateId: "d-269bc2b469934e85b3e437fd98e0fcd4", // Updated
                    dynamicTemplateData: {
                        ...commonDynamicData,
                        recipientName: clientName,
                        changes: changes.map(c => ({
                            label: c.label,
                            oldValue: c.oldValue,
                            newValue: c.newValue
                        }))
                    }
                });
            }

            for (const workerId of workersToAdd) {
                const worker = await prisma.user.findUnique({ where: { id: workerId } });
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-c2235cb8340643d3b7e9745773f47e01", // New Assignment
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: worker.name
                        }
                    });
                }
            }

            for (const workerId of workersToRemove) {
                const worker = subservice.userServiceProject.find(usp => usp.user_id === workerId)?.user;
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-0f0dd1c1ccb242fcb8ffa1f5ba41b425", // Assignment Removed
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: worker.name
                        }
                    });
                }
            }

            if (dateChanged) {
                const remainingWorkerIds = currentWorkerIds.filter(id => !workersToRemove.includes(id));
                for (const workerId of remainingWorkerIds) {
                    const worker = subservice.userServiceProject.find(usp => usp.user_id === workerId)?.user;
                    if (worker?.email) {
                        await sendEmail({
                            to: worker.email,
                            templateId: "d-269bc2b469934e85b3e437fd98e0fcd4", // Updated
                            dynamicTemplateData: {
                                ...commonDynamicData,
                                recipientName: worker.name,
                                changes: changes.map(c => ({
                                    label: c.label,
                                    oldValue: c.oldValue,
                                    newValue: c.newValue
                                }))
                            }
                        });
                    }
                }
            }

            for (const subId of subsToAdd) {
                const subcontractor = await prisma.subcontractor.findUnique({ where: { id: subId } });
                if (subcontractor?.email) {
                    await sendEmail({
                        to: subcontractor.email,
                        templateId: "d-c2235cb8340643d3b7e9745773f47e01", // New Assignment
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: subcontractor.name
                        }
                    });
                }
            }

            for (const subId of subsToRemove) {
                const sub = subservice.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                if (sub?.email) {
                    await sendEmail({
                        to: sub.email,
                        templateId: "d-0f0dd1c1ccb242fcb8ffa1f5ba41b425", // Assignment Removed
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: sub.name
                        }
                    });
                }
            }

            if (dateChanged) {
                const remainingSubIds = currentSubIds.filter(id => !subsToRemove.includes(id));
                for (const subId of remainingSubIds) {
                    const sub = subservice.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                    if (sub?.email) {
                        await sendEmail({
                            to: sub.email,
                            templateId: "d-269bc2b469934e85b3e437fd98e0fcd4", // Updated
                            dynamicTemplateData: {
                                ...commonDynamicData,
                                recipientName: sub.name,
                                changes: changes.map(c => ({
                                    label: c.label,
                                    oldValue: c.oldValue,
                                    newValue: c.newValue
                                }))
                            }
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
