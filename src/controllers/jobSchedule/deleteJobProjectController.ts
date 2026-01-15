import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate } from "../../templateEmail/jobScheduleGlobalTemplate";

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

            // DB Delete (Cascade should handle junctions if configured, but let's be explicit if needed)
            await prisma.serviceProject.delete({ where: { id: serviceProjectId } });

            // Email Logic
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false }
            });

            const companyLogo = company.avatar ? await getPresignedUrl(company.avatar) : "";
            const projectLocation = serviceProject.Project?.location || "Not specified";
            const contractNumber = serviceProject.Project?.contract_number || "N/A";

            // 1. Notify Client
            const clientEmail = serviceProject.Project?.workContext?.Email || serviceProject.Project?.client?.email;
            const clientName = serviceProject.Project?.workContext?.Name || serviceProject.Project?.client?.name;

            if (clientEmail && clientName) {
                await transporter.sendMail({
                    from: SMTP_CONFIG.user,
                    to: clientEmail,
                    subject: `Cancelled: Project Schedule - #${contractNumber}`,
                    html: jobScheduleGlobalTemplate(
                        clientName, serviceProject.name, contractNumber, projectLocation, 'CANCELLED', [], 
                        companyLogo, company.name, company.phone || undefined, company.email || undefined
                    )
                });
            }

            // 2. Notify All assigned Workers
            const workers = serviceProject.UserServiceProject.map(usp => usp.user);
            for (const worker of workers) {
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `Cancelled: Assignment for ${serviceProject.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, serviceProject.name, contractNumber, projectLocation, 'CANCELLED', [], 
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
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
