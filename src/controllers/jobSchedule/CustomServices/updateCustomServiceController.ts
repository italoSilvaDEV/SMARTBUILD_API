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
                    project: {
                        include: {
                            client: true,
                            workContext: true
                        }
                    },
                    userServiceProjects: {
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
            }) as any;

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

            const currentWorkerIds = customService.userServiceProjects.map((usp: any) => usp.user_id);
            const newWorkerIds = Array.from(new Set(body.users?.map(u => u.id) || []));

            const workersToRemove = currentWorkerIds.filter((id: string) => !newWorkerIds.includes(id));
            const workersToAdd = newWorkerIds.filter((id: string) => !currentWorkerIds.includes(id));

            const currentSubIds = customService.subContractorServiceProjects.map((s: any) => s.subcontractor_id);
            const newSubIds = Array.from(new Set(body.subcontractors?.map(s => s.id) || []));

            const subsToRemove = currentSubIds.filter((id: string) => !newSubIds.includes(id));
            const subsToAdd = newSubIds.filter((id: string) => !currentSubIds.includes(id));

            await prisma.$transaction(async (tx) => {
                await tx.customServiceSchedule.update({
                    where: { id: body.customServiceId },
                    data: {
                        name: body.name,
                        description: body.description,
                        start_date: body.startDate,
                        deadline: body.deadline
                    }
                });

                if (workersToRemove.length > 0) {
                    await tx.userServiceProject.deleteMany({
                        where: { custom_service_schedule_id: body.customServiceId, user_id: { in: workersToRemove } }
                    });
                }

                if (subsToRemove.length > 0) {
                    await tx.subContractorServiceProject.deleteMany({
                        where: { custom_service_schedule_id: body.customServiceId, subcontractor_id: { in: subsToRemove } }
                    });
                }

                for (const workerId of workersToAdd) {
                    await tx.userServiceProject.create({
                        data: { custom_service_schedule_id: body.customServiceId, user_id: workerId }
                    });
                }

                for (const subId of subsToAdd) {
                    await tx.subContractorServiceProject.create({
                        data: { custom_service_schedule_id: body.customServiceId, subcontractor_id: subId }
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
                projectName: body.name || customService.name,
                contractNumber: contractNumber,
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(body.startDate || customService.start_date || undefined),
                deadlineFormatted: formatSGDate(body.deadline || customService.deadline || undefined),
                description: body.description ? removeHtml(body.description) : customService.description ? removeHtml(customService.description) : "",
                currentYear: new Date().getFullYear().toString(),
            };

            for (const workerId of workersToAdd) {
                const worker = await prisma.user.findUnique({ where: { id: workerId } });
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-c2235cb8340643d3b7e9745773f47e01", // Assigned
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: worker.name
                        }
                    });
                }
            }

            for (const workerId of workersToRemove) {
                const worker = customService.userServiceProjects.find((usp: any) => usp.user_id === workerId)?.user;
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-0f0dd1c1ccb242fcb8ffa1f5ba41b425", // Removed
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
                        templateId: "d-c2235cb8340643d3b7e9745773f47e01", // Assigned
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: subcontractor.name
                        }
                    });
                }
            }

            for (const subId of subsToRemove) {
                const sub = customService.subContractorServiceProjects.find((s: any) => s.subcontractor_id === subId)?.subcontractor;
                if (sub?.email) {
                    await sendEmail({
                        to: sub.email,
                        templateId: "d-0f0dd1c1ccb242fcb8ffa1f5ba41b425", // Removed
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: sub.name
                        }
                    });
                }
            }

            return res.status(200).json({ message: "Custom service updated successfully" });
        } catch (error) {
            // console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
