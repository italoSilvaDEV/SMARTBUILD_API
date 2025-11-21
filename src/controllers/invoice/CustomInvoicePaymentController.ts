import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import nodemailer from "nodemailer";
import { invoicePaidPaymentEmail } from "../../templateEmail/invoicePaidPayment";

export class CustomInvoicePaymentController {
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

  async createPayment(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { paymentMethod, notes, amount } = req.body;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          type_invoicebase: true,
          invoiceType: true,
          payment: true,
          externalInvoiceId: true,
          updatedAt: true,
          totalAmount: true,
          project: {
            select: {
              id: true,
            }
          },
          estimate: {
            select: {
              id: true,
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      // Verificar se já existe um pagamento para esta fatura
      if (invoice.payment) {
        return res.status(400).json({
          error: "Payment already exists for this invoice",
          payment: invoice.payment
        });
      }

      // Validar o método de pagamento
      if (!paymentMethod) {
        return res.status(400).json({ error: "Payment method is required" });
      }

      // Validar o valor do pagamento
      if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ error: "Valid payment amount is required" });
      }

      await prisma.$transaction(async (smartbuild) => {
        await smartbuild.invoicePayment.create({
          data: {
            paymentMethod,
            notes: notes || "",
            amount,
            invoiceId
          }
        });

        await smartbuild.invoice.update({
          where: { id: invoiceId },
          data: {
            status: "paid",
            checked: true,
            updatedAt: new Date()
          }
        });

        await smartbuild.pdfProject.deleteMany({
          where: {
            invoice_id: invoiceId
          }
        })

        await smartbuild.invoiceTimeline.create({
          data: {
            description: `Payment`,
            invoice: {
              connect: { id: invoiceId }
            }
          }
        });

        if (invoice.type_invoicebase === "project" && invoice.project) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice #" + invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(invoice.totalAmount)) + " on " + invoice.updatedAt.toLocaleDateString('en-US'),
              projectId: invoice.project.id
            }
          })
        } else if (invoice.type_invoicebase === "estimate" && invoice.estimate) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice #" + invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(invoice.totalAmount)) + " on " + invoice.updatedAt.toLocaleDateString('en-US'),
              estimateId: invoice.estimate.id
            }
          })
        }
      });

      const payment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      try {
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
            }
          }
        });

        if (!invoiceWithDetails) {
          console.error("Invoice not found for email sending");
          return res.status(201).json({
            message: "Payment recorded successfully",
            payment
          });
        }

        const client = invoiceWithDetails.project?.client || invoiceWithDetails.estimate?.project?.client;
        const company = invoiceWithDetails.project?.company || invoiceWithDetails.estimate?.project?.company;

        if (!client || !client.email) {
          console.log("Client email not found, skipping email send");
          return res.status(201).json({
            message: "Payment recorded successfully",
            payment
          });
        }

        const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
          where: {
            invoiceId: invoiceId
          }
        });

        try {
          await CustomInvoicePaymentController.verifySMTPConfig();
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
        });

        const companyAvatar = company?.avatar
          ? await getPresignedUrl(company.avatar)
          : "";

        const attachments = [];

        if (pdfInvoicePaid && pdfInvoicePaid.uri) {
          try {
            const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);
            const pdfResponse = await fetch(pdfUrl);
            if (pdfResponse.ok) {
              const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
              const fileName = pdfInvoicePaid.original_file_name || `invoice_paid_${invoice.externalInvoiceId}.pdf`;
              attachments.push({
                filename: fileName,
                content: pdfBuffer,
                contentType: 'application/pdf'
              });
            }
          } catch (error) {
            console.error("Error fetching PDF invoice paid:", error);
          }
        }

        const paymentDate = payment?.createdAt || new Date();
        const emailSubject = `Invoice #${invoice.externalInvoiceId} - Payment Confirmation`;

        const emailHtml = invoicePaidPaymentEmail(
          client.name || 'Client',
          companyAvatar || "",
          company?.name || '',
          invoice.externalInvoiceId || invoiceId,
          Number(amount),
          paymentDate.toISOString(),
          paymentMethod
        );

        await transporter.sendMail({
          from: SMTP_CONFIG.user,
          to: client.email,
          subject: emailSubject,
          html: emailHtml,
          attachments: attachments.length > 0 ? attachments : undefined,
          text: `
Dear ${client.name || 'Client'},

We are pleased to confirm that Invoice #${invoice.externalInvoiceId} has been paid successfully.

Payment Details:
- Invoice Number: #${invoice.externalInvoiceId}
- Payment Amount: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(amount))}
- Payment Date: ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Payment Method: ${paymentMethod}

Thank you for your prompt payment. If you have any questions, please feel free to contact us.

Have a great day!
${company?.name || ''}
          `.trim()
        });

      } catch (emailError: any) {
        console.error("Error sending payment confirmation email:", emailError);
      }

      return res.status(201).json({
        message: "Payment recorded successfully",
        payment
      });
    } catch (error: any) {
      console.error("Error recording custom invoice payment:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async getPayment(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const payment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      if (!payment) {
        return res.status(404).json({ error: "Payment not found for this invoice" });
      }

      return res.status(200).json(payment);
    } catch (error: any) {
      console.error("Error fetching payment:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async updatePayment(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { paymentMethod, notes, amount } = req.body;

    try {
      // Verificar se o pagamento existe
      const existingPayment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      if (!existingPayment) {
        return res.status(404).json({ error: "Payment not found for this invoice" });
      }

      // Atualizar o pagamento
      const updatedPayment = await prisma.invoicePayment.update({
        where: { invoiceId },
        data: {
          paymentMethod: paymentMethod || existingPayment.paymentMethod,
          notes: notes !== undefined ? notes : existingPayment.notes,
          amount: amount || existingPayment.amount
        }
      });

      return res.status(200).json({
        message: "Payment updated successfully",
        payment: updatedPayment
      });
    } catch (error: any) {
      console.error("Error updating payment:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 