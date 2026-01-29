import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { workerAssignmentEmail } from "../../../templateEmail/workerAssignment";
import { sendEmail } from "../../../utils/sendEmail";

interface User {
    id: string
}

interface Subcontractor {
    id: string
}

interface CreateSubserviceRequest {
    name: string
    description?: string
    serviceId?: string
    customServiceId?: string
    start_date?: string
    deadline?: string
    price?: number
    users?: User[]
    subcontractors?: Subcontractor[]
    skipEmail?: boolean
}

export class CreateSubserviceController {
    async handle(req: Request, res: Response) {
        try {
            const body = req.body as CreateSubserviceRequest;

            if (!body.name || !body.start_date || !body.deadline || (!body.serviceId && !body.customServiceId)) {
                return res.status(400).json({ error: "Name, start_date, deadline and serviceId or customServiceId are required" });
            }

            let projectId: string | null = null;
            let companyId: string | null = null;

            if (body.serviceId) {
                const service = await prisma.serviceProject.findUnique({
                    where: { id: body.serviceId },
                    include: { Project: true }
                });
                if (!service) return res.status(404).json({ error: "Service not found" });
                projectId = service.projectId;
                companyId = service.Project?.company_id || null;
            } else if (body.customServiceId) {
                const customService = await prisma.customServiceSchedule.findUnique({
                    where: { id: body.customServiceId },
                    include: { project: true }
                });
                if (!customService) return res.status(404).json({ error: "Custom service not found" });
                projectId = customService.projectId;
                companyId = customService.project?.company_id || null;
            }

            if (!companyId) return res.status(400).json({ error: "Company not found for this context" });

            const workerIds = Array.from(new Set(body.users?.map(u => u.id) || []));
            const subcontractorIds = Array.from(new Set(body.subcontractors?.map(s => s.id) || []));

            const subservice = await prisma.$transaction(async (tx) => {
                const created = await tx.subServicesProject.create({
                    data: {
                        name: body.name,
                        description: body.description || null,
                        serviceProjectId: body.serviceId || null,
                        custom_service_schedule_id: body.customServiceId || null,
                        start_date: body.start_date || null,
                        deadline: body.deadline || null,
                        quantity: 1,
                        price: body.price || 0,
                        status: "pending"
                    }
                });

                for (const id of workerIds) {
                    await tx.userServiceProject.create({
                        data: { user_id: id, sub_service_project_id: created.id }
                    });
                }

                for (const id of subcontractorIds) {
                    await tx.subContractorServiceProject.create({
                        data: { subcontractor_id: id, sub_service_project_id: created.id }
                    });
                }

                return created;
            });

            return res.status(201).json({ message: "Subservice created successfully", data: subservice });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}