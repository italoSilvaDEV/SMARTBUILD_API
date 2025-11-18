import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { changeOrderEmail } from "../../templateEmail/changeOrder";
import fs from 'fs';

export class SendEmailChangeOrderController {
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
            console.log('✅ SMTP Configuration verified:', verification);
            return verification;
        } catch (error) {
            console.error('❌ SMTP Configuration error:', error);
            throw error;
        }
    }

    async handle(req: Request, res: Response) {
        let attachmentFiles: Express.Multer.File[] = [];

        const cleanupTempFiles = (files: Express.Multer.File[]) => {
            if (files && files.length > 0) {
                files.forEach(file => {
                    try {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    } catch (error) {
                        console.error(`❌ Error deleting temporary file ${file.path}:`, error);
                    }
                });
            }
        };

        try {
            const { id } = req.params;
            attachmentFiles = req.files as Express.Multer.File[];

            const {
                from,
                to,
                cc,
                bcc,
                subject,
                body,
                sendMeCopy,
                numberPerson
            } = req.body;

            if (!to) {
                cleanupTempFiles(attachmentFiles);
                return res.status(400).json({ error: "Recipient email is required" });
            }

            const validateFileType = (file: Express.Multer.File): boolean => {
                const allowedTypes = [
                    'image/jpeg',
                    'image/jpg',
                    'image/png',
                    'image/gif',
                    'image/bmp',
                    'image/webp',
                    'application/pdf'
                ];
                return allowedTypes.includes(file.mimetype);
            };


            if (attachmentFiles && attachmentFiles.length > 0) {
                const invalidFiles = attachmentFiles.filter(file => !validateFileType(file));
                if (invalidFiles.length > 0) {
                    cleanupTempFiles(attachmentFiles);
                    return res.status(400).json({
                        error: "Invalid file type. Only images (JPEG, PNG, GIF, BMP, WEBP) and PDF files are allowed.",
                        invalidFiles: invalidFiles.map(f => ({
                            name: f.originalname,
                            type: f.mimetype
                        }))
                    });
                }
            }

            const parseEmailList = (emailInput: any): string[] => {
                if (!emailInput) return [];

                if (typeof emailInput === 'string') {
                    try {
                        if (emailInput.startsWith('[') && emailInput.endsWith(']')) {
                            const parsed = JSON.parse(emailInput);
                            if (Array.isArray(parsed)) {
                                return parsed.filter(email => email && typeof email === 'string').map(email => email.trim());
                            }
                        }
                        return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
                    } catch (error) {
                        return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
                    }
                }

                if (Array.isArray(emailInput)) {
                    return emailInput.filter(email => email && typeof email === 'string').map(email => email.trim());
                }

                return [];
            };

            const dataEmail = {
                from: from || '',
                to: parseEmailList(to),
                cc: parseEmailList(cc),
                bcc: parseEmailList(bcc),
                sendMeCopy: sendMeCopy === 'true' || sendMeCopy === true,
                subject: subject || '',
                body: body || ''
            };

            if (!dataEmail.to || dataEmail.to.length === 0) {
                cleanupTempFiles(attachmentFiles);
                return res.status(400).json({
                    error: "Please provide at least one recipient email address"
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
                                    company: true
                                }
                            }
                        }
                    }
                }
            });

            if (!changeOrder) {
                cleanupTempFiles(attachmentFiles);
                return res.status(404).json({
                    error: "Change order not found"
                });
            }

            const pdfProject = await prisma.pdfProject.findFirst({
                where: {
                    changeOrderId: changeOrder.id
                }
            });

            if (!pdfProject || !pdfProject.uri) {
                cleanupTempFiles(attachmentFiles);
                return res.status(404).json({ error: "PDF Project not found or has no URI" });
            }

            const pdfUrl = await getPresignedUrl(pdfProject.uri);

            const pdfResponse = await fetch(pdfUrl);
            if (!pdfResponse.ok) {
                cleanupTempFiles(attachmentFiles);
                throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
            }
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            const fileName = pdfProject.original_file_name || `change_order_${changeOrder.id}.pdf`;
            const SMTP_CONFIG = require("../../config/smtp");

            try {
                await SendEmailChangeOrderController.verifySMTPConfig();
            } catch (error) {
                console.error('SMTP verification failed:', error);
                cleanupTempFiles(attachmentFiles);
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

            const results = [];
            const companyAvatar = changeOrder.estimate?.project?.company?.avatar
                ? await getPresignedUrl(changeOrder.estimate.project.company.avatar)
                : "";

            const allRecipients = [
                ...dataEmail.to,
                ...dataEmail.cc,
                ...dataEmail.bcc
            ];

            if (dataEmail.sendMeCopy && dataEmail.from) {
                allRecipients.push(dataEmail.from);
            }

            const uniqueRecipients = [...new Set(allRecipients.filter(email => email && typeof email === 'string'))];

            try {
                const attachments = [
                    {
                        filename: fileName,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ];

                if (attachmentFiles && attachmentFiles.length > 0) {
                    for (const file of attachmentFiles) {
                        try {
                            const fileBuffer = fs.readFileSync(file.path);
                            attachments.push({
                                filename: file.originalname,
                                content: fileBuffer,
                                contentType: file.mimetype
                            });
                        } catch (error) {
                            console.error(`❌ Error reading attachment file ${file.originalname}:`, error);
                        }
                    }
                }

                const mailOptions = {
                    from: SMTP_CONFIG.user,
                    replyTo: dataEmail.from,
                    to: dataEmail.to,
                    cc: dataEmail.cc.length > 0 ? dataEmail.cc : undefined,
                    bcc: dataEmail.bcc.length > 0 ? dataEmail.bcc : undefined,
                    subject: dataEmail.subject || `${changeOrder.estimate?.project?.company?.name} - Change Order`,
                    html: changeOrderEmail(
                        changeOrder.estimate?.project?.client?.name || '',
                        companyAvatar || "",
                        changeOrder.estimate?.project?.company?.name || '',
                        numberPerson || changeOrder.id,
                        changeOrder.estimate?.number || '',
                        Number(changeOrder.total_amount),
                        changeOrder.id,
                        changeOrder.estimate?.project?.client?.email || '',
                        dataEmail.body
                    ),
                    attachments,

                    text: dataEmail.body ? dataEmail.body.replace(/<[^>]*>/g, '') : `
Dear ${changeOrder.estimate?.project?.client?.name || 'Client'},

A change order has been created for your project estimate ${changeOrder.estimate?.number || ''}.

Change Order: ${numberPerson || changeOrder.id}
Additional Amount: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(changeOrder.total_amount))}

Please access the link to view details and approve the change order:
${process.env.URL_FRONT}/changeorder-response/${changeOrder.id}}

We appreciate your business. Feel free to contact us if you have any questions.

Have a great day!
${changeOrder.estimate?.project?.company?.name || ''}
                    `.trim()
                };

                if (dataEmail.sendMeCopy && dataEmail.from) {
                    if (mailOptions.bcc) {
                        if (Array.isArray(mailOptions.bcc)) {
                            mailOptions.bcc.push(dataEmail.from);
                        } else {
                            mailOptions.bcc = [mailOptions.bcc, dataEmail.from];
                        }
                    } else {
                        mailOptions.bcc = [dataEmail.from];
                    }
                }

                await transporter.sendMail(mailOptions);

                for (const recipient of uniqueRecipients) {
                    results.push({ email: recipient, status: "success" });
                }

            } catch (error: any) {
                console.error('❌ Error sending change order email:', error);

                for (const recipient of uniqueRecipients) {
                    results.push({ email: recipient, status: "error", message: error.message });
                }
            } finally {
                cleanupTempFiles(attachmentFiles);
            }

            return res.json({
                success: results.some(r => r.status === "success"),
                results,
                dataEmail: {
                    to: dataEmail.to,
                    cc: dataEmail.cc,
                    bcc: dataEmail.bcc,
                    subject: dataEmail.subject,
                    sendMeCopy: dataEmail.sendMeCopy,
                    attachmentCount: attachmentFiles ? attachmentFiles.length : 0
                }
            });
        } catch (error) {
            console.error('Unexpected error in sendEmail:', error);
            cleanupTempFiles(attachmentFiles);
            return res.status(500).json({ error: "Failed to send change order email" });
        }
    }
}
