import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../../utils/sendEmail";

export class DeleteCustomServiceController {
    async handle(req: Request, res: Response) {
        const {
            customServiceId,
            companyId
        } = req.params;

        try {
            if (!customServiceId || !companyId) {
                return res.status(400).json({
                    error: "Custom Service ID and Company ID are required"
                });
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: companyId
                },
                select: {
                    name: true,
                    avatar: true,
                    phone: true,
                    email: true
                }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const customService = await prisma.customServiceSchedule.findUnique({
                where: { id: customServiceId },
                include: {
                    project: { include: { client: true, workContext: true } },
                    userServiceProjects: { include: { user: true } },
                    subContractorServiceProjects: { include: { subcontractor: true } }
                }
            });

            if (!customService) return res.status(404).json({ error: "Custom service not found" });

            const project = customService.project;
            if (!project) return res.status(404).json({ error: "Project not found" });

            await prisma.customServiceSchedule.delete({ where: { id: customServiceId } });

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || "Not specified";
            const contractNumber = project.contract_number || "N/A";

            const clientEmail = project.workContext?.Email || project.client?.email;
            const clientName = project.workContext?.Name || project.client?.name;

            const commonDynamicData = {
                projectName: customService.name,
                contractNumber: contractNumber,
                companyName: company.name || "",
                currentYear: new Date().getFullYear().toString(),
                isCancelled: true
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

            const workers = customService.userServiceProjects.map(usp => usp.user);
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

            const subcontractors = customService.subContractorServiceProjects.map(s => s.subcontractor);
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

            return res.status(200).json({ message: "Custom service deleted and notifications sent" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
