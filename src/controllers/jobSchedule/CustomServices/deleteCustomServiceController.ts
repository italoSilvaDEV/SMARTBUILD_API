import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate } from "../../../templateEmail/jobScheduleGlobalTemplate";

export class DeleteCustomServiceController {
    async handle(req: Request, res: Response) {
        const { customServiceId, companyId } = req.params;

        try {
            if (!customServiceId || !companyId) {
                return res.status(400).json({ error: "Custom Service ID and Company ID are required" });
            }

            const company = await prisma.company.findUnique({
                where: { id: companyId },
                select: { name: true, avatar: true, phone: true, email: true }
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

            // DB Delete
            await prisma.customServiceSchedule.delete({ where: { id: customServiceId } });

            // Email Logic
            const SMTP_CONFIG = require("../../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false }
            });

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = project.location || "Not specified";
            const contractNumber = project.contract_number || "N/A";

            // 1. Notify Client
            const clientEmail = project.workContext?.Email || project.client?.email;
            const clientName = project.workContext?.Name || project.client?.name;

            if (clientEmail && clientName) {
                await transporter.sendMail({
                    from: SMTP_CONFIG.user,
                    to: clientEmail,
                    subject: `Cancelled: Custom Service Schedule - #${contractNumber}`,
                    html: jobScheduleGlobalTemplate(
                        clientName, customService.name, contractNumber, projectLocation, 'CANCELLED', [], 
                        companyLogo, company.name, company.phone || undefined, company.email || undefined
                    )
                });
            }

            // 2. Notify Workers
            const workers = customService.userServiceProjects.map(usp => usp.user);
            for (const worker of workers) {
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `Cancelled: Assignment for ${customService.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, customService.name, contractNumber, projectLocation, 'CANCELLED', [], 
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
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
