import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { sendEmail } from "../../../utils/sendEmail";

interface User {
    id: string
}

interface Subcontractor {
    id: string
}


interface CreateCustomService {
    name: string
    description?: string
    start_date: string
    deadline: string
    users?: User[]
    subcontractors?: Subcontractor[]
    projectId: string
    companyId: string
    skipEmail?: boolean
}

export class CreateCustomServiceController {
    async handle(req: Request, res: Response) {
        const body = req.body as CreateCustomService;

        if (!body.projectId
            || !body.companyId
            || !body.name
            || !body.start_date
            || !body.deadline
        ) {
            return res.status(400).json({
                error: "Project ID and company ID are required"
            })
        }

        try {
            const company = await prisma.company.findUnique({
                where: { id: body.companyId },
                select: { id: true, name: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const project = await prisma.project.findUnique({
                where: { id: body.projectId, company_id: company.id },
                select: { id: true, contract_number: true, location: true, lat: true, log: true }
            });

            if (!project) return res.status(404).json({ error: "Project not found" });

            const workerIds = Array.from(new Set(body.users?.map(u => u.id) || []));
            const subcontractorIds = Array.from(new Set(body.subcontractors?.map(s => s.id) || []));

            const customService = await prisma.$transaction(async (tx) => {
                const service = await tx.customServiceSchedule.create({
                    data: {
                        name: body.name,
                        description: body.description || null,
                        start_date: body.start_date || null,
                        deadline: body.deadline || null,
                        projectId: project.id,
                    }
                });

                for (const workerId of workerIds) {
                    await tx.userServiceProject.create({
                        data: {
                            user_id: workerId,
                            custom_service_schedule_id: service.id
                        }
                    });
                }

                for (const subId of subcontractorIds) {
                    await tx.subContractorServiceProject.create({
                        data: {
                            subcontractor_id: subId,
                            custom_service_schedule_id: service.id
                        }
                    });
                }

                return service;
            });

            if (!body.skipEmail) {
                const projectLocation = project.location || "Not specified";
                const latitude = project.lat;
                const longitude = project.log;

                const googleMapsLink = (latitude && longitude)
                    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(projectLocation)}`;

                const removeHtml = (text: string): string => {
                    return text.replace(/<[^>]*>/g, '').trim();
                };

                const formatSGDate = (date?: string) => {
                    if (!date) return 'Not set';
                    return new Date(date).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                    }) + ' (' + new Date(date).toLocaleTimeString('en-US', {
                        hour: 'numeric', minute: '2-digit', hour12: true
                    }) + ')';
                };

                const commonDynamicData = {
                    projectName: customService.name,
                    contractNumber: project.contract_number || "N/A",
                    location: projectLocation,
                    googleMapsLink: googleMapsLink,
                    companyName: company.name || "",
                    startDateFormatted: formatSGDate(customService.start_date || undefined),
                    deadlineFormatted: formatSGDate(customService.deadline || undefined),
                    description: customService.description ? removeHtml(customService.description) : "",
                    currentYear: new Date().getFullYear().toString(),
                };

                for (const workerId of workerIds) {
                    const worker = await prisma.user.findUnique({ where: { id: workerId }, select: { name: true, email: true } });
                    if (worker?.email) {
                        await sendEmail({
                            to: worker.email,
                            templateId: "d-c2235cb8340643d3b7e9745773f47e01",
                            dynamicTemplateData: { ...commonDynamicData, recipientName: worker.name }
                        });
                    }
                }

                for (const subId of subcontractorIds) {
                    const sub = await prisma.subcontractor.findUnique({ where: { id: subId }, select: { name: true, email: true } });
                    if (sub?.email) {
                        await sendEmail({
                            to: sub.email,
                            templateId: "d-c2235cb8340643d3b7e9745773f47e01",
                            dynamicTemplateData: { ...commonDynamicData, recipientName: sub.name }
                        });
                    }
                }
            }

            return res.status(201).json({
                message: "Custom service created successfully",
                data: customService
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}