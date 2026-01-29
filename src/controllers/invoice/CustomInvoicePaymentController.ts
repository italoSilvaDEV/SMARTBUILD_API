import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";

export class CustomInvoicePaymentController {
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
              location: true,
              contract_number: true,
              company: {
                select: {
                  id: true,
                  name: true,
                  avatar: true,
                  email: true,
                  phone: true
                }
              },
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              },
              workContext: {
                select: {
                  id: true,
                  Email: true,
                  Name: true,
                  location: true
                }
              }
            }
          },
          estimate: {
            select: {
              id: true,
              project: {
                select: {
                  id: true,
                  location: true,
                  contract_number: true,
                  company: {
                    select: {
                      id: true,
                      name: true,
                      avatar: true,
                      email: true,
                      phone: true
                    }
                  },
                  client: {
                    select: {
                      id: true,
                      name: true,
                      email: true
                    }
                  },
                  workContext: {
                    select: {
                      id: true,
                      Email: true,
                      Name: true,
                      location: true
                    }
                  }
                }
              }
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

        await smartbuild.invoiceTimeline.create({
          data: {
            description: `Payment`,
            invoice: {
              connect: { id: invoiceId }
            }
          }
        });

        const project = invoice.project || invoice.estimate?.project;
        if (invoice.type_invoicebase === "project" && project) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice #" + invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(invoice.totalAmount)) + " on " + new Date().toLocaleDateString('en-US'),
              projectId: project.id
            }
          })
        } else if (invoice.type_invoicebase === "estimate" && invoice.estimate) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice #" + invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(invoice.totalAmount)) + " on " + new Date().toLocaleDateString('en-US'),
              estimateId: invoice.estimate.id
            }
          })
        }
      });

      const payment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      try {
        const project = invoice.project || invoice.estimate?.project;
        const client = project?.client;
        const company = project?.company;
        const workContext = project?.workContext;

        const recipientEmail = workContext?.Email || client?.email;
        const recipientName = workContext?.Name || client?.name || 'Client';

        if (recipientEmail) {
          const companyAvatar = company?.avatar ? await getPresignedUrl(company.avatar) : "";
          const totalFormatted = new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(Number(amount));
          const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);
          const projectDispName = `Project #${project?.contract_number || 'N/A'}`;
          const paymentDateFormatted = new Date().toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric'
          });

          const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
            where: { invoiceId }
          });

          const attachments = [];
          if (pdfInvoicePaid && pdfInvoicePaid.uri) {
            try {
              const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);
              const pdfResponse = await fetch(pdfUrl);
              if (pdfResponse.ok) {
                const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                attachments.push({
                  filename: pdfInvoicePaid.original_file_name || `payment_receipt_${invoiceCode}.pdf`,
                  content: pdfBuffer.toString('base64'),
                  type: 'application/pdf',
                  disposition: 'attachment'
                });
              }
            } catch (error) {
              console.error("Error fetching PDF invoice paid:", error);
            }
          }

          await sendEmail({
            to: recipientEmail,
            subject: `Payment Received - Invoice #${invoiceCode} - ${company?.name || 'SmartBuild'}`,
            templateId: "d-b6e6e8ed26f14399a3ecceb89a6dee03",
            dynamicTemplateData: {
              recipientName: recipientName,
              projectName: projectDispName,
              invoiceNumber: invoiceCode,
              totalAmount: totalFormatted,
              paymentDate: paymentDateFormatted,
              companyName: company?.name || "SmartBuild",
              companyAvatar: companyAvatar,
              customBody: notes || "",
              currentYear: new Date().getFullYear().toString(),
              recipientEmail: recipientEmail,
              location: workContext?.location || project?.location || "Not specified"
            },
            attachments: attachments as any
          });

          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: recipientEmail,
              status: "success",
              sentAt: new Date()
            }
          });
        }
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