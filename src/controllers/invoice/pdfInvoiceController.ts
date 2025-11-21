import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { invoicePaidReceiptEmail } from "../../templateEmail/invoicePaidReceipt";

export class PdfInvoicePaidController {
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

    async create(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.body

        const file = req.file

        if (!invoiceId || !file) {
            return res.status(400).json({
                error: "Invoice ID and file are required"
            })
        }

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true
                }
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            const existingPdf = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    invoiceId: invoiceId
                }
            })

            if (existingPdf && existingPdf.uri) {
                await deleteFileFromS3(existingPdf.uri);
            }

            const newFileName = await uploadFileToS3_2(file, '');

            const newPdf = await prisma.pdfInvoicePaid.create({
                data: {
                    original_file_name: file.originalname,
                    uri: newFileName,
                    invoiceId: invoiceId
                },
            })

            return res.status(200).json({
                message: "PDF created successfully",
                data: newPdf
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async update(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.body

        const file = req.file

        if (!invoiceId || !file) {
            return res.status(400).json({
                error: "Invoice ID and file are required"
            })
        }

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true
                }
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            const existingPdf = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    invoiceId: invoiceId
                }
            })

            if (!existingPdf) {
                return res.status(404).json({
                    error: "PDF not found"
                })
            }

            if (existingPdf.uri) {
                await deleteFileFromS3(existingPdf.uri);
            }

            const newFileName = await uploadFileToS3_2(file, '');

            const updatedPdf = await prisma.pdfInvoicePaid.update({
                where: {
                    id: existingPdf.id
                },
                data: {
                    original_file_name: file.originalname,
                    uri: newFileName
                }
            })

            return res.status(200).json({
                message: "PDF updated successfully",
                data: updatedPdf
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async delete(req: Request, res: Response) {
        const {
            pdfId,
        } = req.params

        if (!pdfId) {
            return res.status(400).json({
                error: "PDF ID is required"
            })
        }

        try {
            const existingPdf = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    id: pdfId
                }
            })

            if (!existingPdf) {
                return res.status(404).json({
                    error: "PDF not found"
                })
            }

            if (existingPdf.uri) {
                await deleteFileFromS3(existingPdf.uri);
            }

            await prisma.pdfInvoicePaid.delete({
                where: {
                    id: pdfId
                }
            })

            return res.status(200).json({
                message: "PDF deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async setChecked(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.body

        if (!invoiceId) {
            return res.status(400).json({
                error: "Invoice ID is required"
            })
        }

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true,
                    externalInvoiceId: true,
                    totalAmount: true
                }
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            await prisma.invoice.update({
                where: {
                    id: invoiceId
                },
                data: {
                    checked: true
                }
            })

            try {
                const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
                    where: {
                        invoiceId: invoiceId
                    }
                })

                if (!pdfInvoicePaid || !pdfInvoicePaid.uri) {
                    console.log("PDF invoice paid not found, skipping email send");
                    return res.status(200).json({
                        message: "Invoice checked successfully",
                    })
                }

                const invoiceWithDetails = await prisma.invoice.findUnique({
                    where: { id: invoiceId },
                    include: {
                        project: {
                            include: {
                                client: true,
                                company: true
                            }
                        },
                        estimate: {
                            include: {
                                project: {
                                    include: {
                                        client: true,
                                        company: true
                                    }
                                }
                            }
                        },
                        payment: true
                    }
                })

                if (!invoiceWithDetails) {
                    console.error("Invoice not found for email sending");
                    return res.status(200).json({
                        message: "Invoice checked successfully",
                    })
                }

                const client = invoiceWithDetails.project?.client || invoiceWithDetails.estimate?.project?.client;
                const company = invoiceWithDetails.project?.company || invoiceWithDetails.estimate?.project?.company;

                if (!client || !client.email) {
                    console.log("Client email not found, skipping email send");
                    return res.status(200).json({
                        message: "Invoice checked successfully",
                    })
                }

                try {
                    await PdfInvoicePaidController.verifySMTPConfig();
                } catch (error) {
                    console.error('SMTP verification failed:', error);
                }

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
                })

                const companyAvatar = company?.avatar
                    ? await getPresignedUrl(company.avatar)
                    : ""

                const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);
                const pdfResponse = await fetch(pdfUrl);
                if (!pdfResponse.ok) {
                    throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
                }
                const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                const fileName = pdfInvoicePaid.original_file_name || `invoice_paid_${invoice.externalInvoiceId}.pdf`;

                const paymentDate = invoiceWithDetails.payment?.paidAt
                    || invoiceWithDetails.payment?.createdAt
                    || invoiceWithDetails.updatedAt
                    || new Date();

                const emailSubject = `Invoice #${invoice.externalInvoiceId} - Payment Receipt`;

                const emailHtml = invoicePaidReceiptEmail(
                    client.name || 'Client',
                    companyAvatar || "",
                    company?.name || '',
                    invoice.externalInvoiceId || invoiceId,
                    Number(invoice.totalAmount),
                    paymentDate.toISOString()
                )

                await transporter.sendMail({
                    from: SMTP_CONFIG.user,
                    to: client.email,
                    subject: emailSubject,
                    html: emailHtml,
                    attachments: [
                        {
                            filename: fileName,
                            content: pdfBuffer,
                            contentType: 'application/pdf'
                        }
                    ],
                    text: `
Dear ${client.name || 'Client'},

We are sending you the payment receipt for Invoice #${invoice.externalInvoiceId} that was paid on ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.

Please find the payment receipt attached to this email for your records.

Invoice Details:
- Invoice Number: #${invoice.externalInvoiceId}
- Invoice Amount: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(invoice.totalAmount))}
- Payment Date: ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Status: Paid

If you have any questions, please feel free to contact us.

Thank you for your business!
Have a great day!
${company?.name || ''}
                    `.trim()
                })

                console.log(`Payment receipt email sent to ${client.email}`);
            } catch (emailError: any) {
                console.error("Error sending payment receipt email:", emailError);
            }

            return res.status(200).json({
                message: "Invoice checked successfully",
            })
        } catch (error) {
            console.error("Error in setChecked:", error);
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}