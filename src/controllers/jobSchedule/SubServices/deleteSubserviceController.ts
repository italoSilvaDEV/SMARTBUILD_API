import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../../utils/sendEmail";

export class DeleteSubserviceController {
    async handle(req: Request, res: Response) {
        const { subserviceId, companyId } = req.params;

        try {
            if (!subserviceId || !companyId) {
                return res.status(400).json({ error: "Subservice ID and Company ID are required" });
            }

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const subservice = await prisma.subServicesProject.findUnique({
                where: { id: subserviceId },
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

            await prisma.subServicesProject.delete({ where: { id: subserviceId } });

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || "Not specified";
            const contractNumber = project.contract_number || "N/A";

            const clientEmail = project.workContext?.Email || project.client?.email;
            const clientName = project.workContext?.Name || project.client?.name;

            const commonDynamicData = {
                projectName: subservice.name,
                contractNumber: contractNumber,
                companyName: company.name || "",
                currentYear: new Date().getFullYear().toString(),
            };

            if (clientEmail && clientName) {
                await sendEmail({
                    to: clientEmail,
                    templateId: "d-66ecce3621174b65958f2e9c4e3b28f8",
                    dynamicTemplateData: {
                        ...commonDynamicData,
                        recipientName: clientName
                    }
                });
            }

            const workers = subservice.userServiceProject.map(usp => usp.user);
            for (const worker of workers) {
                if (worker?.email) {
                    await sendEmail({
                        to: worker.email,
                        templateId: "d-66ecce3621174b65958f2e9c4e3b28f8",
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: worker.name
                        }
                    });
                }
            }

            const subcontractors = subservice.subContractorServiceProjects.map(s => s.subcontractor);
            for (const sub of subcontractors) {
                if (sub?.email) {
                    await sendEmail({
                        to: sub.email,
                        templateId: "d-66ecce3621174b65958f2e9c4e3b28f8",
                        dynamicTemplateData: {
                            ...commonDynamicData,
                            recipientName: sub.name
                        }
                    });
                }
            }

            return res.status(200).json({ message: "Subservice deleted and notifications sent" });
        } catch (error) {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
