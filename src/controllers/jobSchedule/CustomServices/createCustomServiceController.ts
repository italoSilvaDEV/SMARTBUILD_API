import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { sendEmail } from "../../../utils/sendEmail";
import { SchedulePushNotificationService } from "../../../services/SchedulePushNotificationService";

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

            const [workerRecipients, subcontractorRecipients] = await Promise.all([
                prisma.user.findMany({
                    where: { id: { in: workerIds } },
                    select: { email: true }
                }),
                prisma.subcontractor.findMany({
                    where: { id: { in: subcontractorIds } },
                    select: { email: true }
                })
            ]);

            const recipientEmails = [
                ...workerRecipients.map((u) => u.email),
                ...subcontractorRecipients.map((s) => s.email)
            ].filter(Boolean) as string[];

            await SchedulePushNotificationService.sendToEmails({
                emails: recipientEmails,
                title: "New service assigned",
                body: `You were assigned to ${customService.name || "a custom service"}.`,
                data: {
                    type: "service_assignment",
                    projectId: project.id,
                    serviceProjectId: null,
                    subServiceId: null,
                    customServiceId: customService.id
                }
            });

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
