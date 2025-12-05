import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { QuickBooksInvoiceController } from "../quickbooks/invoice/QuickBooksInvoiceController";
import nodemailer from "nodemailer";
import { invoicePaidPaymentEmail } from "../../templateEmail/invoicePaidPayment";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const stripe = stripeConfig.getClient();

export class StripeInvoicePaymentController {
  private quickBooksController: QuickBooksInvoiceController;

  constructor() {
    this.quickBooksController = new QuickBooksInvoiceController();
  }
  async createPayment(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { paymentMethod, notes, amount } = req.body;

    try {
      // Verificar se a fatura existe e é do tipo stripe
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          project: {
            include: {
              company: true
            }
          },
          estimate: true,
          PaymentIntents: {
            orderBy: { createdAt: 'desc' }
          },
          payment: true
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "stripe") {
        return res.status(400).json({ error: "Not a Stripe invoice" });
      }

      if (!invoice.project?.company?.stripeAccountId) {
        return res.status(400).json({ error: "Company not connected to Stripe" });
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

      // Verificar se existe PaymentIntent ativo e cancelá-lo se necessário
      const activePaymentIntent = invoice.PaymentIntents.find(pi =>
        ['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(pi.status)
      );

      let cancelledPaymentIntentId: string | null = null;

      if (activePaymentIntent) {
        try {
          // Verificar se o PaymentIntent pode ser cancelado
          const stripePI = await stripe.paymentIntents.retrieve(
            activePaymentIntent.stripePaymentIntentId,
            { stripeAccount: invoice.project.company.stripeAccountId }
          );

          // Só cancelar se estiver em um status que permite cancelamento
          if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'requires_capture'].includes(stripePI.status)) {
            await stripe.paymentIntents.cancel(
              activePaymentIntent.stripePaymentIntentId,
              { stripeAccount: invoice.project.company.stripeAccountId }
            );

            // Atualizar o status no banco
            await prisma.paymentIntentRecord.update({
              where: { id: activePaymentIntent.id },
              data: { status: 'canceled', updatedAt: new Date() }
            });

            cancelledPaymentIntentId = activePaymentIntent.stripePaymentIntentId;
            console.log(`PaymentIntent ${activePaymentIntent.stripePaymentIntentId} cancelado para permitir pagamento manual`);
          }
        } catch (stripeError: any) {
          console.warn("Erro ao cancelar PaymentIntent no Stripe:", stripeError.message);
          // Continuar mesmo se não conseguir cancelar no Stripe
        }
      }

      // Verificar se existe PaymentIntent em processamento que impede o pagamento manual
      const processingPaymentIntent = invoice.PaymentIntents.find(pi =>
        ['processing', 'succeeded'].includes(pi.status)
      );

      if (processingPaymentIntent) {
        return res.status(400).json({
          error: `Cannot manually record payment. There is a ${processingPaymentIntent.status} payment in progress.`,
          paymentIntentId: processingPaymentIntent.stripePaymentIntentId,
          status: processingPaymentIntent.status
        });
      }

      // Variável para armazenar resultado do QuickBooks
      let quickBooksVoidResult = null;
      let quickBooksVoidError = null;

      await prisma.$transaction(async (smartbuild) => {
        // Criar o pagamento manual
        const payment = await smartbuild.invoicePayment.create({
          data: {
            paymentMethod,
            notes: notes || "",
            amount,
            invoiceId
          }
        });

        // Atualizar o status da invoice
        await smartbuild.invoice.update({
          where: { id: invoiceId },
          data: {
            status: "paid",
            checked: true,
            updatedAt: new Date()
          }
        });

        // Criar entrada no timeline
        await smartbuild.invoiceTimeline.create({
          data: {
            description: `Manual payment recorded${cancelledPaymentIntentId ? ` (PaymentIntent ${cancelledPaymentIntentId} was cancelled)` : ''}`,
            invoice: {
              connect: { id: invoiceId }
            }
          }
        });

        // Criar entrada no timeline do projeto/estimate
        if (invoice.type_invoicebase === "project" && invoice.project) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice #" + invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(invoice.totalAmount)) + " on " + invoice.updatedAt.toLocaleDateString('en-US'),
              projectId: invoice.project.id
            }
          });
        } else if (invoice.type_invoicebase === "estimate" && invoice.estimate) {
          await smartbuild.invoicePaymentTimeLine.create({
            data: {
              description: "Payment invoice #" + invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
              }).format(Number(invoice.totalAmount)) + " on " + invoice.updatedAt.toLocaleDateString('en-US'),
              estimateId: invoice.estimate.id
            }
          });
        }
      });

      // TODO: Deletar invoice no QuickBooks quando pagamento manual for registrado
      // FUNCIONALIDADE COMENTADA TEMPORARIAMENTE - DESCOMENTAR QUANDO NECESSÁRIO
      /*
      // Tentar deletar invoice no QuickBooks (não deve falhar o processo se der erro)
      try {
        console.log("Verificando se existe invoice no QuickBooks para deletar...");

        // Verificar se o invoice tem referência do QuickBooks
        if (invoice.idQuickbookContabio && invoice.user_id) {
          console.log(`Tentando deletar invoice ${invoice.idQuickbookContabio} no QuickBooks...`);

          // Verificar se o usuário tem uma conta QuickBooks conectada
          const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
            where: { user_id: invoice.user_id },
          });

          if (quickBooksAccount) {
            // Usar o controller instanciado no constructor
            const qbController = this.quickBooksController;

            if (!qbController) {
              throw new Error("QuickBooksController is not initialized");
            }

            quickBooksVoidResult = await qbController.deleteInvoiceInternal({
              quickBooksInvoiceId: invoice.idQuickbookContabio,
              userId: invoice.user_id,
              companyId: invoice.project.company.id,
              calledFromStripe: true // Indicar que foi chamado pelo Stripe
            });

            console.log("Invoice deletado no QuickBooks com sucesso:", quickBooksVoidResult?.quickbooksId);

            // Remover a referência do QuickBooks do invoice local
            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                idQuickbookContabio: null,
                docNumberQuickBooksContabio: null
              }
            });

            // Adicionar evento na timeline sobre sucesso no QuickBooks
            await prisma.invoiceTimeline.create({
              data: {
                description: `QuickBooks invoice deleted successfully (ID: ${quickBooksVoidResult?.quickbooksId}) - Manual payment recorded`,
                invoice: {
                  connect: { id: invoiceId }
                }
              }
            });
          } else {
            console.log("Usuário não possui conta QuickBooks conectada. Pulando deleção no QB.");
          }
        } else {
          console.log("Invoice não possui referência do QuickBooks. Pulando deleção no QB.");
        }
      } catch (qbError: any) {
        console.error("Erro ao deletar invoice no QuickBooks:", qbError.message);
        quickBooksVoidError = qbError.message;

        // Adicionar evento na timeline sobre erro no QuickBooks
        try {
          await prisma.invoiceTimeline.create({
            data: {
              description: `Failed to delete QuickBooks invoice: ${qbError.message}`,
              invoice: {
                connect: { id: invoiceId }
              }
            }
          });
        } catch (timelineError) {
          console.error("Erro ao registrar falha do QuickBooks na timeline:", timelineError);
        }
      }
      */

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          project: {
            include: {
              client: { select: { id: true, name: true, email: true, phone: true } },
              workContext: { select: { id: true, Email: true, Name: true } }
            }
          },
          estimate: {
            include: {
              project: {
                include: {
                  client: { select: { id: true, name: true, email: true, phone: true } },
                  workContext: { select: { id: true, Email: true, Name: true } }
                }
              }
            }
          },
          company: { select: { id: true, name: true, avatar: true, email: true, phone: true } }
        }
      });

      if (updatedInvoice) {
        try {
          await this.sendPaymentConfirmationEmailWithPdf(updatedInvoice, paymentMethod, amount);
        } catch (pdfEmailError: any) {
          console.error("Erro ao enviar email com PDF de confirmação:", pdfEmailError.message);
        }
      }

      // Buscar o pagamento recém-criado para retornar
      const payment = await prisma.invoicePayment.findUnique({
        where: { invoiceId }
      });

      return res.status(201).json({
        message: "Payment recorded successfully",
        payment,
        cancelledPaymentIntentId,
        // quickBooks: {
        //   success: !!quickBooksVoidResult,
        //   result: quickBooksVoidResult,
        //   error: quickBooksVoidError
        // }
      });
    } catch (error: any) {
      console.error("Error recording Stripe invoice payment:", error);
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

  private async sendPaymentConfirmationEmailWithPdf(invoiceData: any, paymentMethod: string, amount: number) {
    try {
      const project = invoiceData.project || invoiceData.estimate?.project;
      const client = invoiceData.project?.client || invoiceData.estimate?.project?.client;
      const company = invoiceData.company;
      const workContext = project?.workContext;

      const recipientEmail = workContext?.Email || client?.email;
      const recipientName = workContext?.Name || client?.name || 'Client';

      if (!recipientEmail) {
        console.log("Recipient email not found (neither work context nor client email), skipping email send");
        return;
      }

      // Buscar o PDF de invoice pago (opcional - pode não existir para invoices antigos)
      const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
        where: {
          invoiceId: invoiceData.id
        }
      });

      // Configurar SMTP
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

      // Buscar o PDF do S3 (apenas se existir)
      const attachments = [];
      if (pdfInvoicePaid?.uri) {
        try {
          const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);
          const pdfResponse = await fetch(pdfUrl);
          if (pdfResponse.ok) {
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            const fileName = pdfInvoicePaid.original_file_name || `invoice_paid_${invoiceData.externalInvoiceId || invoiceData.id}.pdf`;
            attachments.push({
              filename: fileName,
              content: pdfBuffer,
              contentType: 'application/pdf'
            });
            console.log(`PDF paid anexado ao email: ${fileName}`);
          }
        } catch (error) {
          console.warn("Erro ao buscar PDF invoice paid, enviando email sem anexo:", error);
          // Continua sem o PDF anexado
        }
      } else {
        console.log("PDF invoice paid não encontrado, enviando email sem anexo");
      }

      const paymentDate = new Date();
      const formattedAmount = `$${amount.toFixed(2)}`;
      const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;
      const emailSubject = `Invoice #${invoiceCode} - Payment Confirmation`;

      const emailHtml = invoicePaidPaymentEmail(
        recipientName,
        companyAvatar || "",
        company?.name || '',
        invoiceCode,
        amount,
        paymentDate.toISOString(),
        paymentMethod || 'Manual Payment'
      );

      await transporter.sendMail({
        from: SMTP_CONFIG.user,
        to: recipientEmail,
        subject: emailSubject,
        html: emailHtml,
        attachments: attachments.length > 0 ? attachments : undefined,
        text: `
Dear ${recipientName},

We are pleased to confirm that Invoice #${invoiceCode} has been paid successfully.

Payment Details:
- Invoice Number: #${invoiceCode}
- Payment Amount: ${formattedAmount}
- Payment Date: ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Payment Method: ${paymentMethod || 'Manual Payment'}

Thank you for your prompt payment. If you have any questions, please feel free to contact us.

Have a great day!
${company?.name || ''}
        `.trim()
      });

      console.log(`Email com PDF enviado para ${recipientEmail}`);

      // Log do envio de email
      await prisma.invoiceEmailLog.create({
        data: {
          invoiceId: invoiceData.id,
          recipient: recipientEmail,
          status: 'success'
        }
      });

    } catch (error: any) {
      console.error("[ManualPaymentConfirmationWithPdf] Erro ao enviar email com PDF:", error.message);
      // Não fazer throw para não interromper o fluxo principal
    }
  }
}
