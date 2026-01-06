import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { changeOrderApprovedEmail } from "../../templateEmail/changeOrderApproved";

export class SendApprovedEmailController {
    private static async verifySMTPConfig() {
        try {
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: {
                    user: SMTP_CONFIG.user,
                    pass: SMTP_CONFIG.pass,
                },
                tls: {
                    rejectUnauthorized: false,
                },
            });

            const verification = await transporter.verify();
            console.log('SMTP Configuration verified:', verification);
            return verification;
        } catch (error) {
            console.error('SMTP Configuration error:', error);
            throw error;
        }
    }

    async handle(req: Request, res: Response) {
        const { id } = req.params;

        try {
            if (!id) {
                return res.status(400).json({
                    error: "Change Order ID is required"
                });
            }

            const changeOrder = await prisma.changeOrder.findUnique({
                where: { id },
                include: {
                    estimate: {
                        include: {
                            project: {
                                include: {
                                    client: true,
                                    workContext: true,
                                    company: true
                                }
                            }
                        }
                    }
                }
            });

            if (!changeOrder) {
                return res.status(404).json({
                    error: "Change order not found"
                });
            }

            if (changeOrder.status !== 'approved') {
                return res.status(400).json({
                    error: "Change order is not approved"
                });
            }

            const project = changeOrder.estimate?.project;
            const company = project?.company;

            const clientName = project?.workContext?.Name || project?.client?.name || 'Client';

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                });
            }

            if (!company.email) {
                return res.status(404).json({
                    error: "Company email not found"
                });
            }

            const SMTP_CONFIG = require("../../config/smtp");

            try {
                await SendApprovedEmailController.verifySMTPConfig();
            } catch (error) {
                console.error('SMTP verification failed:', error);
                return res.status(500).json({
                    error: "SMTP configuration error",
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }

            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: {
                    user: SMTP_CONFIG.user,
                    pass: SMTP_CONFIG.pass,
                },
                tls: {
                    rejectUnauthorized: false,
                },
            });

            const additionalAmount = Number(changeOrder.total_amount);
            const formattedAmount = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(additionalAmount);

            const emailSubject = `APPROVED: Change Order #${changeOrder.id} added +${formattedAmount} to Estimate`;

            try {
                const mailOptions = {
                    from: SMTP_CONFIG.user,
                    to: company.email,
                    subject: emailSubject,
                    html: changeOrderApprovedEmail(
                        clientName,
                        company.name,
                        changeOrder.id,
                        changeOrder.estimate?.number || '',
                        additionalAmount,
                        changeOrder.id,
                        company.email
                    ),
                    text: `
Dear ${company.name},

Great news! ${clientName} has approved Change Order #${changeOrder.id}.

Approved Additional Amount: ${formattedAmount}
Estimate: ${changeOrder.estimate?.number || ''}

You can view the change order details at:
${process.env.URL_FRONT}/change-order/${changeOrder.id}

Best regards,
SmartBuild Team
                    `.trim()
                };

                await transporter.sendMail(mailOptions);

                console.log('Approved email sent to:', company.email);

                return res.json({
                    success: true,
                    message: "Approval email sent successfully",
                    data: {
                        to: company.email,
                        subject: emailSubject,
                        changeOrderId: changeOrder.id,
                        clientName,
                        additionalAmount: formattedAmount
                    }
                });

            } catch (error: any) {
                console.error('❌ Error sending approved email:', error);
                return res.status(500).json({
                    success: false,
                    error: "Failed to send approval email",
                    details: error.message
                });
            }

        } catch (error) {
            console.error('Unexpected error in sendApprovedEmail:', error);
            return res.status(500).json({
                error: "Failed to send approval email",
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
}
