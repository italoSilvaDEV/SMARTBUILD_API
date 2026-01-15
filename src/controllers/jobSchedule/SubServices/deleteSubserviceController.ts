import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";
import { jobScheduleGlobalTemplate } from "../../../templateEmail/jobScheduleGlobalTemplate";

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

            // DB Delete
            await prisma.subServicesProject.delete({ where: { id: subserviceId } });

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
                    subject: `Cancelled: Subservice Schedule - #${contractNumber}`,
                    html: jobScheduleGlobalTemplate(
                        clientName, subservice.name, contractNumber, projectLocation, 'CANCELLED', [], 
                        companyLogo, company.name, company.phone || undefined, company.email || undefined
                    )
                });
            }

            // 2. Notify Workers
            const workers = subservice.userServiceProject.map(usp => usp.user);
            for (const worker of workers) {
                if (worker?.email) {
                    await transporter.sendMail({
                        from: SMTP_CONFIG.user,
                        to: worker.email,
                        subject: `Cancelled: Assignment for ${subservice.name}`,
                        html: jobScheduleGlobalTemplate(
                            worker.name, subservice.name, contractNumber, projectLocation, 'CANCELLED', [], 
                            companyLogo, company.name, company.phone || undefined, company.email || undefined
                        )
                    });
                }
            }

            return res.status(200).json({ message: "Subservice deleted and notifications sent" });
        } catch (error) {
            console.error(error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
