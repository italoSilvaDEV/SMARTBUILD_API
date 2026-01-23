import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate, ScheduleChange } from "../../templateEmail/jobScheduleGlobalTemplate";
import { sendEmail } from "../../utils/sendEmail";

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

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = serviceProject.Project?.workContext?.location || serviceProject.Project?.location || "Not specified";
            const contractNumber = serviceProject.Project?.contract_number || "N/A";
            const latitude = serviceProject.Project?.workContext?.latitude?.toString() || serviceProject.Project?.lat;
            const longitude = serviceProject.Project?.workContext?.longitude?.toString() || serviceProject.Project?.log;

            const googleMapsLink = (latitude && longitude)
                ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

            const clientEmail = serviceProject.Project?.workContext?.Email || serviceProject.Project?.client?.email;
            const clientName = serviceProject.Project?.workContext?.Name || serviceProject.Project?.client?.name;

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
                projectName: serviceProject.name,
                contractNumber: contractNumber,
                location: projectLocation,
                googleMapsLink: googleMapsLink,
                companyName: company.name || "",
                startDateFormatted: formatSGDate(body.startDate || serviceProject.start_date || undefined),
                deadlineFormatted: formatSGDate(body.deadline || serviceProject.deadline || undefined),
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

            if (dateChanged) {
                const remainingWorkerIds = currentWorkerIds.filter(id => !workersToRemove.includes(id));
                for (const workerId of remainingWorkerIds) {
                    const worker = serviceProject.UserServiceProject.find(usp => usp.user_id === workerId)?.user;
                    if (worker?.email) {
                        await sendEmail({
                            to: worker.email,
                            templateId: "d-269bc2b469934e85b3e437fd98e0fcd4",
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

            if (dateChanged) {
                const remainingSubIds = currentSubIds.filter(id => !subsToRemove.includes(id));
                for (const subId of remainingSubIds) {
                    const sub = serviceProject.subContractorServiceProjects.find(s => s.subcontractor_id === subId)?.subcontractor;
                    if (sub?.email) {
                        await sendEmail({
                            to: sub.email,
                            templateId: "d-269bc2b469934e85b3e437fd98e0fcd4",
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

            return res.status(200).json({ message: "Service project updated successfully" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
