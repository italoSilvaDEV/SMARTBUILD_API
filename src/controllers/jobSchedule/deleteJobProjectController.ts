import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";

export class DeleteJobProjectController {
    async handle(req: Request, res: Response) {
        const { serviceProjectId, companyId } = req.params;

        try {
            if (!serviceProjectId || !companyId) {
                return res.status(400).json({ error: "Service Project ID and Company ID are required" });
            }

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true, avatar: true, phone: true, email: true }
            });

            if (!company) return res.status(404).json({ error: "Company not found" });

            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: serviceProjectId },
                include: {
                    Project: { include: { client: true, workContext: true } },
                    UserServiceProject: { include: { user: true } },
                    subContractorServiceProjects: { include: { subcontractor: true } }
                }
            });

            if (!serviceProject) return res.status(404).json({ error: "Service project not found" });

            await prisma.$transaction([
                prisma.serviceProject.update({
                    where: {
                        id: serviceProjectId
                    },
                    data: {
                        start_date: null,
                        deadline: null,
                        scheduleCompleted: false
                    }
                }),
                prisma.userServiceProject.deleteMany({
                    where: { service_project_id: serviceProjectId }
                }),
                prisma.subContractorServiceProject.deleteMany({
                    where: { service_project_id: serviceProjectId }
                })
            ]);

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = serviceProject.Project?.location || "Not specified";
            const contractNumber = serviceProject.Project?.contract_number || "N/A";

            const clientEmail = serviceProject.Project?.workContext?.Email || serviceProject.Project?.client?.email;
            const clientName = serviceProject.Project?.workContext?.Name || serviceProject.Project?.client?.name;

            const commonDynamicData = {
                projectName: serviceProject.name,
                contractNumber: contractNumber,
                companyName: company.name || "",
                companyReplyToEmail: company.email || "",
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

            const workers = serviceProject.UserServiceProject.map(usp => usp.user);
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

            const subcontractors = serviceProject.subContractorServiceProjects.map(s => s.subcontractor);
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

            return res.status(200).json({ message: "Service project deleted and notifications sent" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
