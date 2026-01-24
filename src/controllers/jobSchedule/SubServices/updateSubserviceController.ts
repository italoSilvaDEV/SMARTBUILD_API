import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../../utils/sendEmail";
import { ScheduleChange } from "../../../templateEmail/jobScheduleGlobalTemplate";

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
            }) as any;

            if (!subservice) return res.status(404).json({ error: "Subservice not found" });

            const project = subservice.serviceProject?.Project || subservice.custom_service_schedule?.project;
            if (!project) return res.status(404).json({ error: "Project context not found" });

            const changes: ScheduleChange[] = [];

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

            const currentWorkerIds = subservice.userServiceProject.map((usp: any) => usp.user_id);
            const newWorkerIds = Array.from(new Set(body.users?.map(u => u.id) || []));

            const workersToRemove = currentWorkerIds.filter((id: string) => !newWorkerIds.includes(id));
            const workersToAdd = newWorkerIds.filter((id: string) => !currentWorkerIds.includes(id));

            const currentSubIds = subservice.subContractorServiceProjects.map((s: any) => s.subcontractor_id);
            const newSubIds = Array.from(new Set(body.subcontractors?.map(s => s.id) || []));

            const subsToRemove = currentSubIds.filter((id: string) => !newSubIds.includes(id));
            const subsToAdd = newSubIds.filter((id: string) => !currentSubIds.includes(id));

            await prisma.$transaction(async (tx) => {
                await tx.subServicesProject.update({
                    where: { id: body.subserviceId },
                    data: {
                        name: body.name,
                        description: body.description,
                        start_date: body.startDate,
                        deadline: body.deadline
                    }
                });

                if (workersToRemove.length > 0) {
                    await tx.userServiceProject.deleteMany({
                        where: { sub_service_project_id: body.subserviceId, user_id: { in: workersToRemove } }
                    });
                }

                if (subsToRemove.length > 0) {
                    await tx.subContractorServiceProject.deleteMany({
                        where: { sub_service_project_id: body.subserviceId, subcontractor_id: { in: subsToRemove } }
                    });
                }

                for (const workerId of workersToAdd) {
                    await tx.userServiceProject.create({
                        data: { sub_service_project_id: body.subserviceId, user_id: workerId }
                    });
                }

                for (const subId of subsToAdd) {
                    await tx.subContractorServiceProject.create({
                        data: { sub_service_project_id: body.subserviceId, subcontractor_id: subId }
                    });
                }
            });

            const projectLocation = project.workContext?.location || project.location || "Not specified";
            const contractNumber = project.contract_number || "N/A";
            const latitude = project.workContext?.latitude?.toString() || project.lat;
            const longitude = project.workContext?.longitude?.toString() || project.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const removeHtml = (text: string): string => {
                return text.replace(/<[^>]*>/g, '').trim();
            };

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
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(body.startDate || subservice.start_date || undefined),
                deadlineFormatted: formatSGDate(body.deadline || subservice.deadline || undefined),
                description: body.description ? removeHtml(body.description) : subservice.description ? removeHtml(subservice.description) : "",
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
                const worker = subservice.userServiceProject.find((usp: any) => usp.user_id === workerId)?.user;
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
                const sub = subservice.subContractorServiceProjects.find((s: any) => s.subcontractor_id === subId)?.subcontractor;
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

            return res.status(200).json({ message: "Subservice updated successfully" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
