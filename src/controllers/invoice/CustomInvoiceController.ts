import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import fs from "fs";
import { generatePdf } from "../../utils/generatePdf";
import { CreatePdfProjectEstimateInvoiceController } from "../projects/CreatePdfProjectEstimateInvoiceController";
import { QuickBooksInvoiceController } from "../quickbooks/invoice/QuickBooksInvoiceController";
import { stripeConfig } from "../../config/stripe";
import { sendEmail } from "../../utils/sendEmail";
import { formatInvoicePaymentDate } from "../../utils/invoicePaymentDate";

const stripe = stripeConfig.getClient();

export class CustomInvoiceController {
  private quickBooksController: QuickBooksInvoiceController;

  constructor() {
    this.quickBooksController = new QuickBooksInvoiceController();
  }

  /**
   * Helper function to validate and cancel PaymentIntents when converting invoice type
   * Returns error message if there are pending/processing PaymentIntents that block conversion
   */
  private async validateAndCancelPaymentIntents(
    invoiceId: string,
    stripeAccountId: string | undefined
  ): Promise<{ canConvert: boolean; error?: string }> {
    try {
      // Find all PaymentIntents for this invoice
      const paymentIntents = await prisma.paymentIntentRecord.findMany({
        where: { invoiceId: invoiceId }
      });

      if (paymentIntents.length === 0) {
        return { canConvert: true };
      }

      // Check for processing or requires_action states that block conversion
      const blockingStatuses = ['processing', 'requires_action'];
      const blockingPaymentIntents = paymentIntents.filter(pi =>
        blockingStatuses.includes(pi.status)
      );

      if (blockingPaymentIntents.length > 0) {
        console.log("Found blocking PaymentIntents:", blockingPaymentIntents.map(pi => ({
          id: pi.stripePaymentIntentId,
          status: pi.status
        })));

        return {
          canConvert: false,
          error: `Cannot convert invoice type while payment is ${blockingPaymentIntents[0].status}. Please wait for payment to complete or cancel it first.`
        };
      }

      // Cancel any PaymentIntents that are in cancelable states
      const cancelableStatuses = ['requires_payment_method', 'requires_confirmation', 'requires_capture'];
      const cancelablePaymentIntents = paymentIntents.filter(pi =>
        cancelableStatuses.includes(pi.status)
      );

      if (cancelablePaymentIntents.length > 0) {
        console.log("Canceling PaymentIntents before conversion...");

        for (const paymentIntent of cancelablePaymentIntents) {
          try {
            // Verify current status in Stripe before canceling
            const stripePI = await stripe.paymentIntents.retrieve(
              paymentIntent.stripePaymentIntentId,
              { stripeAccount: stripeAccountId }
            );

            if (cancelableStatuses.includes(stripePI.status)) {
              await stripe.paymentIntents.cancel(
                paymentIntent.stripePaymentIntentId,
                { stripeAccount: stripeAccountId }
              );

              // Update status in DB
              await prisma.paymentIntentRecord.update({
                where: { id: paymentIntent.id },
                data: { status: 'canceled', updatedAt: new Date() }
              });

              console.log(`PaymentIntent ${paymentIntent.stripePaymentIntentId} canceled successfully`);
            } else {
              console.log(`PaymentIntent ${paymentIntent.stripePaymentIntentId} is in status ${stripePI.status} - cannot be canceled`);
            }
          } catch (piError: any) {
            console.warn(`Error canceling PaymentIntent ${paymentIntent.stripePaymentIntentId}:`, piError.message);
            // Continue with other PaymentIntents
          }
        }
      }

      return { canConvert: true };

    } catch (error: any) {
      console.error("Error validating PaymentIntents:", error);
      return {
        canConvert: false,
        error: `Error checking payment status: ${error.message}`
      };
    }
  }
  async createInvoice(req: Request, res: Response) {
    const {
      projectId
    } = req.params

    const {
      userId,
      type_invoicebase,
      coefficientPerfentage,
      description,
      dueDate,
      type_value,
      totalAmount,
      estimateId,
      services,
      multi_emails,
      date_creation,
      showPaymentMethods,
      isStandaloneInvoice,
      project_manager_id
    } = req.body

    try {
      const project = await prisma.project.findUnique({
        where: {
          id: projectId
        },
        include: {
          client: true,
          company: true,
        },
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      if (!project.client) {
        return res.status(400).json({ error: "Client not found for this project" });
      }

      const dueDateObj = dueDate ? new Date(dueDate) : new Date();

      let finalTotalAmount = 0;
      const lineItems: any[] = [];

      if (services && Array.isArray(services)) {
        for (const item of services) {
          const serviceAmount = item.total || (item.quantity * item.price);
          const adjustedAmount = serviceAmount * (coefficientPerfentage || 1);

          if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
            continue;
          }

          finalTotalAmount += adjustedAmount;

          lineItems.push({
            name: item.name,
            description: item.description || "",
            quantity: item.quantity,
            price: item.price,
            totalAmount: adjustedAmount
          });
        }
      }

      const allInvoices = await prisma.invoice.findMany({
        where: {
          companyId: project.company_id,
          invoiceType: {
            in: ["custom", "stripe", "quickbooks"]
          },
          externalInvoiceId: {
            not: null
          }
        },
        select: {
          externalInvoiceId: true
        }
      });

      const numericIds = allInvoices
        .map(invoice => parseInt(invoice.externalInvoiceId || ""))
        .filter(num => !isNaN(num) && num > 0);

      let nextInvoiceNumber = 1000;
      if (numericIds.length > 0) {
        const maxNumber = Math.max(...numericIds);
        nextInvoiceNumber = maxNumber + 1;
      }

      // Criar invoice dentro da transaction
      const newInvoice = await prisma.$transaction(async (smartbuild) => {
        const invoice = await smartbuild.invoice.create({
          data: {
            externalInvoiceId: nextInvoiceNumber.toString(),
            invoiceType: "custom",
            status: "open",
            totalAmount: totalAmount,
            showPaymentMethods: showPaymentMethods ?? true,
            dueDate: dueDateObj,
            description: description,
            projectId: project.id,
            companyId: project.company_id,
            user_id: userId,
            type_value: type_value,
            percentageCoefficient: coefficientPerfentage,
            type_invoicebase: type_invoicebase,
            estimateId: estimateId,
            multi_emails: multi_emails,
            isStandaloneInvoice: isStandaloneInvoice || false,
            createdAt: date_creation ? new Date(date_creation) : new Date(),
            project_manager_id: project_manager_id || null
          }
        });

        if (lineItems && lineItems.length > 0) {
          await smartbuild.invoiceItem.createMany({
            data: lineItems.map((item) => ({
              invoiceId: invoice.id,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              totalAmount: item.totalAmount,
            }))
          });
        }

        await smartbuild.invoiceTimeline.create({
          data: {
            description: `Created with total amount $${finalTotalAmount || totalAmount}`,
            invoice: {
              connect: { id: invoice.id }
            }
          }
        });

        return invoice;
      });

      console.log("Invoice salva no banco com ID:", newInvoice.id);

      // Tentar criar invoice no QuickBooks (não deve falhar o processo se der erro)
      // Isso está FORA da transaction para garantir que o invoice já foi commitado
      let quickBooksResult = null;
      let quickBooksError = null;

      try {
        console.log("Verificando configuração do QuickBooks...");

        // Verificar se a criação de invoices no QuickBooks está habilitada
        const quickBooksConfig = await prisma.quickBooksConfig.findUnique({
          where: {
            configType_companyId: {
              configType: 'INVOICE_CREATION',
              companyId: project.company_id!
            }
          }
        });

        const isQuickBooksInvoiceCreationEnabled = quickBooksConfig?.isActive || false;
        console.log(`QuickBooks invoice creation enabled: ${isQuickBooksInvoiceCreationEnabled}`);

        if (!isQuickBooksInvoiceCreationEnabled) {
          console.log("QuickBooks invoice creation is disabled. Skipping QuickBooks integration.");

          // Adicionar evento na timeline sobre configuração desabilitada
          await prisma.invoiceTimeline.create({
            data: {
              description: `QuickBooks invoice creation skipped (feature disabled in company settings)`,
              invoice: {
                connect: { id: newInvoice.id }
              }
            }
          });
        } else {
          console.log("Tentando criar invoice no QuickBooks...");

          // Verificar se o usuário tem uma conta QuickBooks conectada
          const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: project.company_id },
          });

          if (quickBooksAccount) {
            // Preparar serviços para o formato esperado pelo QuickBooks
            const qbServices = services.map((service: any) => ({
              name: service.name || "Service",
              description: service.description || "",
              quantity: service.quantity || 1,
              price: service.price || 0,
              total: service.total || (service.quantity * service.price)
            }));

            // Usar o controller instanciado no constructor
            const qbController = this.quickBooksController;

            if (!qbController) {
              throw new Error("QuickBooksController is not initialized");
            }

            quickBooksResult = await qbController.createInvoiceInternal({
              projectId: project.id,
              description: description || `Invoice for Project ${project.contract_number}`,
              type_invoicebase: type_invoicebase,
              dueDate: dueDate,
              userId: userId,
              coefficientPerfentage: coefficientPerfentage,
              services: qbServices,
              type_value: type_value,
              totalAmountTarget: totalAmount, // Passar o valor total exato do banco local
              calledFromStripe: true // Indicar que foi chamado pelo Custom
            });

            console.log("Invoice criado no QuickBooks com sucesso:", quickBooksResult?.quickbooksId);

            // Atualizar o invoice Custom com os dados do QuickBooks
            if (quickBooksResult?.quickbooksId) {
              await prisma.invoice.update({
                where: { id: newInvoice.id },
                data: {
                  idQuickbookContabio: quickBooksResult.quickbooksId,
                  docNumberQuickBooksContabio: quickBooksResult.docNumber || null,
                  qboCustomerRef: quickBooksResult.qboCustomerRef || null
                }
              });
            }

            // Adicionar evento na timeline sobre sucesso no QuickBooks
            await prisma.invoiceTimeline.create({
              data: {
                description: `QuickBooks invoice created successfully (ID: ${quickBooksResult?.quickbooksId}, DocNumber: ${quickBooksResult?.docNumber})`,
                invoice: {
                  connect: { id: newInvoice.id }
                }
              }
            });
          } else {
            console.log("Usuário não possui conta QuickBooks conectada. Pulando criação no QB.");

            // Adicionar evento na timeline sobre conta não conectada
            await prisma.invoiceTimeline.create({
              data: {
                description: `QuickBooks invoice creation skipped (no QuickBooks account connected)`,
                invoice: {
                  connect: { id: newInvoice.id }
                }
              }
            });
          }
        }
      } catch (qbError: any) {
        console.error("Erro ao criar invoice no QuickBooks:", qbError.message);
        quickBooksError = qbError.message;

        // Adicionar evento na timeline sobre erro no QuickBooks
        try {
          await prisma.invoiceTimeline.create({
            data: {
              description: `Failed to create QuickBooks invoice: ${qbError.message}`,
              invoice: {
                connect: { id: newInvoice.id }
              }
            }
          });
        } catch (timelineError) {
          console.error("Erro ao registrar falha do QuickBooks na timeline:", timelineError);
        }
      }

      return res.status(201).json({
        message: "Custom invoice created successfully",
        invoice: newInvoice,
        quickBooks: {
          success: !!quickBooksResult,
          result: quickBooksResult,
          error: quickBooksError
        }
      });
    } catch (error: any) {
      console.error("Error creating custom invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async getInvoicesByProject(req: Request, res: Response) {
    const { projectId } = req.params;
    const { searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

    try {
      const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
      const itemsLimit = Number(itemsPerPage);
      const search = typeof searchTerm === 'string' ? searchTerm : "";

      const filtro = {
        projectId,
        invoiceType: "custom",
        OR: [
          {
            project: {
              is: {
                client: {
                  is: {
                    name: {
                      contains: search,
                    }
                  }
                }
              }
            }
          },
          {
            description: {
              contains: search,
            }
          }
        ]
      };

      const invoices = await prisma.invoice.findMany({
        where: filtro,
        orderBy: { createdAt: "desc" },
        include: {
          company: true,
          InvoiceSendHistory: {
            orderBy: { sentAt: "desc" }
          },
          project: {
            include: {
              client: {
                select: { id: true, name: true, email: true }
              }
            }
          },
        },
        skip: pageNumber * itemsLimit,
        take: itemsLimit
      });

      const total = await prisma.invoice.count({ where: filtro });

      // Adicionar informação sobre o último envio
      const invoicesWithLastSent = invoices.map(invoice => {
        const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
        return { ...invoice, lastSentAt: lastSend };
      });

      return res.status(200).json({ total, invoices: invoicesWithLastSent });
    } catch (error) {
      console.error("Error fetching custom invoices:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async statusViewInvoice(req: Request, res: Response) {
    const {
      invoiceId
    } = req.params

    if (!invoiceId) {
      return res.status(400).json({
        error: "Invoice ID is required"
      });
    }

    const invoice = await prisma.invoice.findUnique({
      where: {
        id: invoiceId
      }
    });

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice not found"
      });
    }

    try {
      const timeline = await prisma.invoiceTimeline.create({
        data: {
          description: "Invoice viewed",
          invoice: {
            connect: {
              id: invoiceId
            }
          }
        }
      })

      return res.status(200).json({
        message: "Invoice viewed successfully",
        timeline
      })
    } catch (error) {
      return res.status(500).json({
        error: "Internal Server Error"
      });
    }
  }

  // enviar o pdf para o cliente atravez de email
  async sendInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId, companyId, idPdfProject, customSubject, customBody, customEmails } = req.body;

    try {
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      if (!idPdfProject) {
        return res.status(400).json({ error: "PDF Project ID is required" });
      }

      // Validar customEmails se fornecido
      let emailsToSend = [];
      if (customEmails && Array.isArray(customEmails) && customEmails.length > 0) {
        // Validar cada email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = customEmails.filter(email => !emailRegex.test(email));
        if (invalidEmails.length > 0) {
          return res.status(400).json({
            error: "Invalid email addresses in customEmails",
            invalidEmails
          });
        }
        emailsToSend = customEmails;
      }

      // Buscar a fatura com todas as informações necessárias
      const invoice = await prisma.invoice.findFirst({
        where: {
          externalInvoiceId: invoiceId,
          companyId: companyId,
          invoiceType: { in: ["custom", "stripe", "quickbooks"] }
        },
        include: {
          project: {
            include: {
              client: true,
              company: true,
              serviceProject: {
                include: {
                  photos: true // Incluir as fotos dos serviços do projeto
                }
              }
            }
          },
          InvoiceItems: true
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom" && invoice.invoiceType !== "stripe" && invoice.invoiceType !== "quickbooks") {
        return res.status(400).json({ error: "Invoice type not supported for email sending" });
      }

      if (!invoice.project?.client) {
        return res.status(400).json({ error: "Client not found for this invoice" });
      }


      // Se não foram fornecidos customEmails, usar o email do cliente
      if (emailsToSend.length === 0) {
        if (!invoice.project.client.email) {
          return res.status(400).json({ error: "Client email is required when customEmails is not provided" });
        }
        emailsToSend = [invoice.project.client.email];

      }

      // Atualizar o PdfProject com o invoice_id
      // await prisma.pdfProject.update({
      //   where: { id: idPdfProject },
      //   data: {
      //     invoice_id: invoice.id
      //   }
      // });

      // Buscar o PDF para usar como anexo
      const pdfProject = await prisma.pdfProject.findUnique({
        where: { id: idPdfProject }
      });

      const documentsAttachments = await prisma.imagesAttachments.findMany({
        where: {
          invoiceId: invoice.id,
          type_images_attachments: "document"
        }
      })

      if (!pdfProject || !pdfProject.uri) {
        return res.status(404).json({ error: "PDF Project not found or has no URI" });
      }

      // Gerar URL presigned para o PDF
      const pdfUrl = await getPresignedUrl(pdfProject.uri);

      // Baixar o PDF do S3
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      const documentAttachments = [];
      if (documentsAttachments && documentsAttachments.length > 0) {
        for (const document of documentsAttachments) {
          try {
            if (document.url) {
              const documentUrl = await getPresignedUrl(document.url);
              const documentResponse = await fetch(documentUrl);

              if (documentResponse.ok) {
                const documentBuffer = Buffer.from(await documentResponse.arrayBuffer());
                const fileName = document.original_filename || document.title || `document_${document.id}`;
                const contentType = documentResponse.headers.get('content-type') || 'application/octet-stream';

                documentAttachments.push({
                  filename: fileName,
                  content: documentBuffer,
                  contentType: contentType
                });
              }
            }
          } catch (error) {
            console.error(`Error fetching document attachment ${document.id}:`, error);
          }
        }
      }

      // Obter o logo da empresa
      const company = invoice.project.company;
      const companyAvatar = company?.avatar ? await getPresignedUrl(company.avatar) : "";

      // Preparar os dados para o template
      const companyName = company?.name || 'Smart Build';
      const clientName = invoice.project.client.name;
      const totalFormatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(invoice.totalAmount));
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);
      const projectDispName = `Project #${invoice.project?.contract_number || 'N/A'}`;
      const dueDateFormatted = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      }) : 'Not set';

      let paymentUrl = '';
      if (invoice.invoiceType === 'stripe') {
        paymentUrl = `${process.env.URL_FRONT}/pay/${invoice.id}`;
      } else if (invoice.invoiceType === 'quickbooks' && invoice.invoiceUrl) {
        paymentUrl = invoice.invoiceUrl;
      }

      const emailSubject = customSubject || (String(invoice.invoiceType) === 'stripe' ? `Invoice from ${companyName}` : `Invoice #${invoiceCode} - ${companyName}`);

      // Resultados do envio para cada email
      const results = [];

      // Processar todos os emails
      for (const email of emailsToSend) {
        try {
          const attachments = [
            {
              filename: pdfProject.original_file_name || `invoice_${invoiceCode}.pdf`,
              content: pdfBuffer.toString('base64'),
              type: 'application/pdf',
              disposition: 'attachment'
            },
            ...documentAttachments.map(doc => ({
              filename: doc.filename,
              content: doc.content.toString('base64'),
              type: doc.contentType,
              disposition: 'attachment'
            }))
          ];

          await sendEmail({
            to: email,
            subject: emailSubject,
            templateId: "d-0ce549c501c34e958c342212821b0604",
            dynamicTemplateData: {
              recipientName: clientName,
              projectName: projectDispName,
              invoiceNumber: invoiceCode,
              totalAmount: totalFormatted,
              dueDate: dueDateFormatted,
              paymentUrl: paymentUrl,
              companyName: companyName,
              companyReplyToEmail: company?.email || "",
              companyAvatar: companyAvatar,
              customBody: customBody || "",
              currentYear: new Date().getFullYear().toString(),
              recipientEmail: email
            },
            attachments: attachments as any
          });

          // Se chegou aqui, o envio foi bem-sucedido
          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: email,
              status: "success",
              sentAt: new Date()
            }
          });

          // Registrar o envio no histórico
          await prisma.invoiceSendHistory.create({
            data: {
              invoiceId: invoice.id,
              recipient: email,
              user_id: userId
            }
          });

          results.push({ email, status: "success" });

          // Registrar evento na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `Sent to ${email}`,
              invoice: {
                connect: { id: invoice.id }
              }
            }
          });
        } catch (error: any) {
          // Registrar o erro no log
          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: email,
              status: "error",
              errorMessage: error.message || "Unknown error",
              sentAt: new Date()
            }
          });

          results.push({ email, status: "error", message: error.message });

          // Registrar evento na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `Failed to send email to ${email}: ${error.message}`,
              invoice: {
                connect: { id: invoice.id }
              }
            }
          });
        }
      }

      // Verificar se pelo menos um email foi enviado com sucesso
      const successfulSends = results.filter(r => r.status === "success");

      return res.status(200).json({
        message: successfulSends.length > 0 ? "Invoice sent successfully" : "Failed to send invoice to all recipients",
        success: successfulSends.length > 0,
        results,
        totalSent: successfulSends.length,
        totalAttempted: emailsToSend.length
      });
    } catch (error) {
      console.error("Error sending custom invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // invia para o metodo resend mais de um email
  async sendInvoiceMultiple(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId, emails, companyId } = req.body;

    try {
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      // Validar se emails é um array
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: "Please provide at least one email address" });
      }

      // Validar cada email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emails.filter(email => !emailRegex.test(email));
      if (invalidEmails.length > 0) {
        return res.status(400).json({
          error: "Invalid email addresses",
          invalidEmails
        });
      }

      // Buscar a fatura com todas as informações necessárias, agora incluindo companyId
      const invoice = await prisma.invoice.findFirst({
        where: {
          externalInvoiceId: invoiceId,
          companyId: companyId, // Filtrar pelo companyId fornecido
          invoiceType: { in: ["custom", "stripe"] }
        },
        include: {
          project: {
            include: {
              client: true,
              company: true,
              serviceProject: {
                include: {
                  photos: true
                }
              }
            }
          },
          InvoiceItems: true,
          PdfProject: true // Incluir o PDF relacionado
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom" && invoice.invoiceType !== "stripe") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      // Verificar se existe PDF relacionado ao invoice
      let pdfBuffer = null;
      let fileName = null;

      if (invoice.PdfProject && invoice.PdfProject.length > 0) {
        // Pegar o primeiro PDF relacionado (assumindo que há apenas um)
        const pdfProject = invoice.PdfProject[0];

        if (pdfProject.uri) {
          try {
            // Gerar URL presigned para o PDF
            const pdfUrl = await getPresignedUrl(pdfProject.uri);

            // Baixar o PDF do S3
            const pdfResponse = await fetch(pdfUrl);
            if (pdfResponse.ok) {
              pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
              fileName = pdfProject.original_file_name || `invoice_${invoice.externalInvoiceId || invoiceId.substring(0, 8)}.pdf`;
            }
          } catch (error) {
            console.warn("Failed to fetch PDF, will send email without attachment:", error);
          }
        }
      }

      // Obter o logo da empresa
      const company = invoice.project?.company;
      const companyAvatar = company?.avatar ? await getPresignedUrl(company.avatar) : "";

      // Preparar os dados para o template
      const companyName = company?.name || 'Smart Build';
      const clientName = invoice.project?.client?.name || 'Cliente';
      const totalFormatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(invoice.totalAmount));
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);
      const projectDispName = `Project #${invoice.project?.contract_number || 'N/A'}`;
      const dueDateFormatted = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      }) : 'Not set';

      // Determinar a URL correta baseada no tipo de invoice
      let paymentUrl = '';
      if (invoice.invoiceType === 'stripe') {
        paymentUrl = `${process.env.URL_FRONT}/pay/${invoice.id}`;
      } else if (invoice.invoiceUrl && invoice.invoiceType === 'custom') {
        paymentUrl = invoice.invoiceUrl || '';
      }

      const emailSubject = String(invoice.invoiceType) === 'stripe' ? `Invoice from ${companyName}` : `Invoice #${invoiceCode} - ${companyName}`;

      // Resultados do envio para cada email
      const results = [];

      // Processar todos os emails
      for (const email of emails) {
        try {
          const attachments = [];
          if (pdfBuffer && fileName) {
            attachments.push({
              filename: fileName,
              content: pdfBuffer.toString('base64'),
              type: 'application/pdf',
              disposition: 'attachment'
            });
          }

          await sendEmail({
            to: email,
            subject: emailSubject,
            templateId: "d-0ce549c501c34e958c342212821b0604", // Template ID for Invoice Review
            dynamicTemplateData: {
              recipientName: clientName,
              projectName: projectDispName,
              invoiceNumber: invoiceCode,
              totalAmount: totalFormatted,
              dueDate: dueDateFormatted,
              paymentUrl: paymentUrl,
              companyName: companyName,
              companyReplyToEmail: company?.email || "",
              companyAvatar: companyAvatar,
              currentYear: new Date().getFullYear().toString(),
              recipientEmail: email
            },
            attachments: attachments as any
          });

          // Se chegou aqui, o envio foi bem-sucedido
          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: email,
              status: "success",
              sentAt: new Date()
            }
          });

          // Registrar o envio no histórico
          await prisma.invoiceSendHistory.create({
            data: {
              invoiceId: invoice.id,
              recipient: email,
              user_id: userId
            }
          });

          results.push({ email, status: "success" });

          // Adicionar evento na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `Email sent to ${email} successfully`,
              invoice: {
                connect: { id: invoice.id }
              }
            }
          });
        } catch (error: any) {
          // Registrar o erro no log
          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: email,
              status: "error",
              errorMessage: error.message || "Unknown error",
              sentAt: new Date()
            }
          });

          results.push({ email, status: "error", message: error.message });

          // Adicionar evento na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `Failed to send email to ${email}: ${error.message}`,
              invoice: {
                connect: { id: invoice.id }
              }
            }
          });
        }
      }

      // Retornar todos os resultados após processar todos os emails
      return res.status(200).json({
        success: results.some(r => r.status === "success"),
        results
      });
    } catch (error) {
      console.error("Error sending custom invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async updateInvoiceStatus(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { status } = req.body;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      // Validar o status
      const validStatuses = ["draft", "sent", "paid", "void", "uncollectible"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      // Atualizar o status da fatura
      const updatedInvoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status }
      });

      return res.status(200).json({
        message: "Invoice status updated successfully",
        invoice: updatedInvoice
      });
    } catch (error) {
      console.error("Error updating custom invoice status:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async cancelInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { companyId } = req.body;

    try {
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          companyId: companyId,
          invoiceType: "custom"
        }
      });

      if (!invoice) {
        return res.status(404).json({
          error: "Invoice not found"
        });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({
          error: "Not a custom invoice"
        });
      }

      const pdfProject = await prisma.pdfProject.findFirst({
        where: { invoice_id: invoice.id },
        include: {
          fildsPdfProjects: true
        }
      });

      if (pdfProject) {
        try {
          if (pdfProject.fildsPdfProjects.length > 0) {
            await prisma.fildsPdfProject.deleteMany({
              where: { pdfProjectId: pdfProject.id }
            });
          }

          await prisma.fildsPdfProject.deleteMany({
            where: { invoiceId: invoice.id }
          });

          const pdfController = new CreatePdfProjectEstimateInvoiceController();
          await pdfController.deletePdfProject(pdfProject.id);
        } catch (error) {
          console.error("Error deleting PDF and related records:", error);
        }
      }

      // If custom invoice has administrative QB invoice, void it too
      let quickBooksVoidResult = null;
      let quickBooksVoidError = null;

      if (invoice.idQuickbookContabio && invoice.docNumberQuickBooksContabio && companyId) {
        console.log("Custom invoice has administrative QB invoice - voiding it...");
        console.log("QB Invoice ID:", invoice.idQuickbookContabio);

        try {
          const qbController = this.quickBooksController;
          if (qbController) {
            // Use userId from request body or try to get from invoice
            const userId = req.body.userId || invoice.user_id;

            if (userId) {
              quickBooksVoidResult = await qbController.cancelInvoiceInternal({
                quickBooksInvoiceId: invoice.idQuickbookContabio,
                userId: userId,
                companyId: companyId,
                calledFromStripe: true // Internal operation, don't update local DB
              });

              if (quickBooksVoidResult.success) {
                console.log("Administrative QB invoice voided successfully");
              } else {
                console.warn("Failed to void administrative QB invoice, continuing anyway...");
              }
            } else {
              console.warn("UserId not available, skipping QB void");
            }
          }
        } catch (qbError: any) {
          console.warn("Error voiding administrative QB invoice:", qbError.message);
          quickBooksVoidError = qbError.message;
          // Continue with local cancellation despite QB error
        }
      }

      await prisma.invoice.update({
        where: {
          id: invoiceId
        },
        data: {
          status: "void"
        }
      });

      await prisma.invoiceTimeline.create({
        data: {
          description: `Canceled${quickBooksVoidResult ? ' (QB invoice also voided)' : ''}`,
          invoice: {
            connect: { id: invoice.id }
          }
        }
      });

      return res.status(200).json({
        message: "Invoice cancelled successfully",
        quickBooks: quickBooksVoidResult ? {
          success: true,
          result: quickBooksVoidResult
        } : undefined,
        quickBooksError: quickBooksVoidError
      });
    } catch (error: any) {
      console.error("Error cancelling custom invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // gera o pdf para os botoes donwload de pdf em listagem geral de invoice e tab invoice
  async generateInvoicePdf(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { companyId } = req.query; // Obter companyId dos parâmetros de consulta

    try {
      // Buscar a fatura com todas as informações necessárias
      const invoice = await prisma.invoice.findFirst({
        where: {
          externalInvoiceId: invoiceId,
          companyId: companyId as string // Adicionar filtro por companyId
        },
        include: {
          project: {
            include: {
              client: true,
              company: {
                include: {
                  NotesContrac: true
                }
              },
              serviceProject: {
                include: {
                  photos: true
                }
              }
            }
          },
          InvoiceItems: true
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Verificar se o projeto e o cliente existem
      if (!invoice.project || !invoice.project.client) {
        return res.status(400).json({ error: "Project or client information is missing" });
      }

      // Criar um mapa de serviços para facilitar a associação com os itens da fatura
      const serviceMap = new Map();
      invoice.project.serviceProject.forEach(service => {
        serviceMap.set(service.name, service);
      });

      // Transformar os itens da fatura no formato esperado por generatePdf
      const tableData = invoice.InvoiceItems.map((item, index) => {
        // Tentar encontrar o serviço correspondente pelo nome
        const matchingService = serviceMap.get(item.name);

        return {
          id: index + 1,
          date: "",
          productOrService: item.name,
          description: item.description || "",
          qty: Number(item.quantity),
          rate: Number(item.price),
          amount: Number(item.totalAmount),
          photos: matchingService?.photos?.map((photo: { uri: string }) => ({
            uri: photo.uri
          })) || [] // Usar as fotos do serviço correspondente, se existir
        };
      });

      // Calcular o total
      const total = `$${invoice.totalAmount}`;

      // Preparar os dados para o PDF
      const clientName = invoice.project.client.name;
      const invoiceCode = invoice.externalInvoiceId;
      const invoiceAmount = `$${Number(invoice.totalAmount).toFixed(2)}`;
      const company = invoice.project.company;
      const companyName = company?.name || "";
      const phone = company?.phone || "";

      // Obter o logo da empresa
      const urlLogo = company?.avatar ? await getPresignedUrl(company.avatar) : undefined;

      // Preparar os dados das colunas
      const columnText1 = [
        clientName,
      ];

      const columnText2 = [
        "",
      ];

      // Adicionar a data de vencimento apenas se for uma fatura e tiver data de vencimento
      if (invoice.dueDate) {
        // Formatar a data de vencimento ajustando o fuso horário
        const dueDate = new Date(invoice.dueDate);

        // Ajustar para o fuso horário local para evitar problemas com UTC
        const dueDateUTC = new Date(dueDate.getTime() + dueDate.getTimezoneOffset() * 60000);

        const formattedDueDate = dueDateUTC.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          timeZone: 'UTC' // Forçar UTC para evitar ajustes de fuso horário
        });

        columnText1.push(`Due Date: ${formattedDueDate}`);
        // Adicionar um espaço vazio correspondente em columnText2 para manter o alinhamento
        columnText2.push("");
      }

      // Continuar com o restante dos dados das colunas
      columnText1.push(
        "Bill to",
        clientName,
        invoice.project.location || "",
        invoice.project.client.city_and_state || "",
      );

      columnText2.push(
        "Ship to",
        clientName,
        invoice.project.location || "",
        invoice.project.client.city_and_state || "",
      );

      // Montar o endereço completo
      const fullAddress = company?.address || "";

      // Buscar notas da empresa
      const companyNotes = await prisma.contractNotes.findMany({
        where: { company_id: company?.id },
        orderBy: { updatedAt: "asc" }
      });

      // Preparar as notas
      const sanitizedNotes = companyNotes.map(note => note.notes || "") || [];

      // Preparar o objeto de dados para o PDF
      const pdfData = {
        tableData,
        total,
        columnText1,
        columnText2,
        address: fullAddress,
        logoUrl: urlLogo || undefined,
        notes: sanitizedNotes,
        phone: company?.phone || "",
        email: company?.email || "",
        webSiteUrl: company?.webSiteUrl || "",
        name: company?.name || "",
        hideRateColumns: true,
        documentType: 'INVOICE' as 'INVOICE'
      };

      // Gerar o PDF
      const pdfPath = await generatePdf(pdfData, clientName, true);

      // Ler o arquivo PDF
      const pdfBuffer = fs.readFileSync(pdfPath);

      // Configurar os headers para download do PDF
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="invoice_${invoiceCode}.pdf"`);

      // Enviar o PDF como resposta
      res.send(pdfBuffer);

      // Remover o arquivo PDF após o envio
      setTimeout(() => {
        fs.unlinkSync(pdfPath);
      }, 1000);

    } catch (error) {
      console.error("Error generating invoice PDF:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async updateInvoice(req: Request, res: Response) {
    const {
      invoiceId
    } = req.params;

    const {
      coefficientPerfentage,
      description,
      dueDate,
      type_value,
      services,
      totalAmount,
      multi_emails,
      date_creation,
      showPaymentMethods,
      userId,
      project_manager_id
    } = req.body;

    try {
      const existingInvoice = await prisma.invoice.findUnique({
        where: {
          id: invoiceId
        },
        include: {
          project: {
            include: {
              client: true,
              company: true
            }
          },
          InvoiceItems: true
        }
      });

      if (!existingInvoice) {
        return res.status(404).json({
          error: "Invoice not found"
        });
      }

      if (!existingInvoice.project || !existingInvoice.project.company) {
        return res.status(404).json({
          error: "Project or company not found"
        });
      }

      // Armazenar em variáveis locais para garantir que TypeScript reconheça que não são null
      const project = existingInvoice.project;
      const company = existingInvoice.project.company;
      const companyId = existingInvoice.project.company.id;

      const dueDateObj = dueDate ? new Date(dueDate) : existingInvoice.dueDate;

      // RULE 3: If converting FROM stripe to custom/quickbooks, validate PaymentIntents first
      if (existingInvoice.invoiceType === "stripe") {
        console.log(" Invoice is being converted from stripe to custom");
        console.log(" Validating PaymentIntents before conversion...");

        const validation = await this.validateAndCancelPaymentIntents(
          invoiceId,
          existingInvoice.project?.company?.stripeAccountId ?? undefined
        );

        if (!validation.canConvert) {
          return res.status(400).json({
            error: "Cannot convert invoice type",
            message: validation.error || "There are pending payments that prevent conversion"
          });
        }

        console.log(" PaymentIntents validated - conversion can proceed");
      }

      // RULE 2: Handle conversion from quickbooks to custom
      let isConvertingFromQuickbooks = false;
      if (existingInvoice.invoiceType === "quickbooks") {
        console.log(" Invoice is being converted from quickbooks to custom");
        isConvertingFromQuickbooks = true;

        // Delete invoice from QuickBooks before conversion
        if (existingInvoice.idQuickbookContabio && companyId) {
          console.log(" Deleting QuickBooks invoice before conversion to custom");
          console.log("QB Invoice ID:", existingInvoice.idQuickbookContabio);

          try {
            const qbController = this.quickBooksController;
            if (qbController) {
              const deleteResult = await qbController.deleteInvoiceInternal({
                quickBooksInvoiceId: existingInvoice.idQuickbookContabio,
                userId: userId,
                companyId: companyId,
                calledFromStripe: true // Internal deletion, don't delete from local DB
              });

              if (deleteResult.success || deleteResult.notFound) {
                console.log(" QuickBooks invoice deleted successfully during conversion");
              } else {
                console.warn(" Failed to delete QuickBooks invoice, continuing anyway...");
              }
            }
          } catch (deleteError: any) {
            console.warn(" Error deleting QuickBooks invoice:", deleteError.message);
            console.log(" Continuing with conversion despite deletion error...");
          }
        }
      }

      let newInvoiceType
      if (existingInvoice.invoiceType === "stripe" || existingInvoice.invoiceType === "quickbooks") {
        newInvoiceType = "custom";
      } else {
        newInvoiceType = existingInvoice.invoiceType;
      }

      // Atualizar invoice dentro da transaction
      const updatedInvoice = await prisma.$transaction(async (smartbuild) => {
        const invoice = await smartbuild.invoice.update({
          where: {
            id: invoiceId
          },
          data: {
            totalAmount: totalAmount,
            dueDate: dueDateObj,
            description: description || existingInvoice.description,
            type_value: type_value || existingInvoice.type_value,
            percentageCoefficient: coefficientPerfentage,
            showPaymentMethods: showPaymentMethods ?? true,
            invoiceType: newInvoiceType,
            invoiceTypeStripe: null,
            multi_emails: multi_emails || existingInvoice.multi_emails,
            updatedAt: new Date(),
            createdAt: date_creation ? new Date(date_creation) : existingInvoice.createdAt,
            project_manager_id: project_manager_id !== undefined ? project_manager_id : undefined,
            // Clear QB references when converting from QBO to Custom
            ...(isConvertingFromQuickbooks && {
              idQuickbookContabio: null,
              docNumberQuickBooksContabio: null,
              invoiceUrl: null
            })
          },
          include: {
            InvoiceItems: true
          }
        });

        if (services && Array.isArray(services)) {
          await smartbuild.invoiceItem.deleteMany({
            where: {
              invoiceId: invoice.id
            }
          });

          await smartbuild.invoiceItem.createMany({
            data: services.map((item) => ({
              invoiceId: invoice.id,
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              totalAmount: item.totalAmount,
            }))
          });
        }

        await smartbuild.invoiceTimeline.create({
          data: {
            description: `Updated total amount of $${totalAmount.toFixed(2)}`,
            invoice: {
              connect: { id: existingInvoice.id }
            }
          }
        });

        return invoice;
      });

      // Tentar atualizar invoice no QuickBooks (não deve falhar o processo se der erro)
      // Isso está FORA da transaction para garantir que o invoice já foi commitado
      let quickBooksUpdateResult = null;
      let quickBooksUpdateError = null;

      try {
        console.log("Verificando configuração do QuickBooks para update...");

        // Verificar se a criação de invoices no QuickBooks está habilitada
        const quickBooksConfig = await prisma.quickBooksConfig.findUnique({
          where: {
            configType_companyId: {
              configType: 'INVOICE_CREATION',
              companyId: companyId
            }
          }
        });

        const isQuickBooksInvoiceCreationEnabled = quickBooksConfig?.isActive || false;
        console.log(`QuickBooks invoice creation enabled (update): ${isQuickBooksInvoiceCreationEnabled}`);

        if (!isQuickBooksInvoiceCreationEnabled) {
          console.log("QuickBooks invoice creation is disabled. Skipping QuickBooks update.");

          // Adicionar evento na timeline sobre configuração desabilitada
          await prisma.invoiceTimeline.create({
            data: {
              description: `QuickBooks invoice update skipped (feature disabled in company settings)`,
              invoice: {
                connect: { id: invoiceId }
              }
            }
          });
        } else {
          console.log("Tentando atualizar invoice no QuickBooks...");

          // Verificar se o usuário tem uma conta QuickBooks conectada
          const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: companyId },
          });

          // If converting from QBO to Custom, create administrative invoice
          if (isConvertingFromQuickbooks && quickBooksAccount) {
            console.log("Converting from QBO to Custom - creating administrative QB invoice...");

            // Prepare services for QB format
            const qbServicesSource =
              Array.isArray(services) && services.length > 0
                ? services
                : (existingInvoice.InvoiceItems || []).map((ii: any) => ({
                  name: ii.name || "Service",
                  description: ii.description || "",
                  quantity: Number(ii.quantity || 1),
                  price: Number(ii.price || 0),
                  total: Number(ii.totalAmount || 0),
                }));

            const qbServicesForCreate = qbServicesSource.map((s: any) => ({
              name: s.name || "Service",
              description: s.description || "",
              quantity: Number(s.quantity || 1),
              price: Number(s.price || 0),
              total: Number(
                s.total != null ? s.total : (Number(s.quantity || 0) * Number(s.price || 0))
              ),
            }));

            const qbController = this.quickBooksController;
            if (!qbController) throw new Error("QuickBooksController is not initialized");

            const createResult = await qbController.createInvoiceInternal({
              projectId: project.id,
              description: description || `Invoice for Project ${project.contract_number}`,
              type_invoicebase: (existingInvoice as any).type_invoicebase,
              dueDate: dueDate,
              userId: userId,
              coefficientPerfentage: coefficientPerfentage,
              showPaymentMethods: showPaymentMethods ?? true,
              services: qbServicesForCreate,
              type_value: type_value,
              totalAmountTarget: totalAmount ?? 0,
              calledFromStripe: true, // Only create in QB, return QB data
            });

            console.log("Administrative QB invoice created:", createResult?.quickbooksId);

            // Update local invoice with QB references
            if (createResult?.quickbooksId) {
              await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                  idQuickbookContabio: createResult.quickbooksId,
                  docNumberQuickBooksContabio: createResult.docNumber || null,
                  idQuickBooksRef: createResult.quickbooksId,
                  externalDocNumber: createResult.docNumber || null,
                  qboCustomerRef: createResult.qboCustomerRef || null,
                },
              });

              quickBooksUpdateResult = createResult;

              // Add timeline event
              await prisma.invoiceTimeline.create({
                data: {
                  description: `Administrative QuickBooks invoice created after conversion (ID: ${createResult.quickbooksId}, DocNumber: ${createResult.docNumber})`,
                  invoice: { connect: { id: invoiceId } },
                },
              });
            }
          }
          // Verificar se o invoice original tinha referência do QuickBooks
          else if (quickBooksAccount && existingInvoice.idQuickbookContabio) {
            // Preparar serviços para o formato esperado pelo QuickBooks
            const qbServices = services.map((service: any) => ({
              name: service.name || "Service",
              description: service.description || "",
              quantity: service.quantity || 1,
              price: service.price || 0,
              total: service.total || (service.quantity * service.price)
            }));

            // Usar o controller instanciado no constructor
            const qbController = this.quickBooksController;

            if (!qbController) {
              throw new Error("QuickBooksController is not initialized");
            }

            quickBooksUpdateResult = await qbController.updateInvoiceInternal({
              quickBooksInvoiceId: existingInvoice.idQuickbookContabio,
              projectId: project.id,
              description: description || `Updated Invoice for Project ${project.contract_number}`,
              dueDate: dueDate,
              userId: userId,
              coefficientPerfentage: coefficientPerfentage,
              showPaymentMethods: showPaymentMethods ?? true,
              services: qbServices,
              totalAmountTarget: totalAmount, // Passar o valor total exato do banco local
              calledFromStripe: true // Indicar que foi chamado pelo Custom
            });

            console.log("Invoice atualizado no QuickBooks com sucesso:", quickBooksUpdateResult?.quickbooksId);

            if (quickBooksUpdateResult?.qboCustomerRef) {
              await prisma.invoice.update({
                where: { id: invoiceId },
                data: {
                  qboCustomerRef: quickBooksUpdateResult.qboCustomerRef,
                },
              });
            }

            // Adicionar evento na timeline sobre sucesso no QuickBooks
            await prisma.invoiceTimeline.create({
              data: {
                description: `QuickBooks invoice updated successfully (ID: ${quickBooksUpdateResult?.quickbooksId})`,
                invoice: {
                  connect: { id: invoiceId }
                }
              }
            });
          } else {
            if (!quickBooksAccount) {
              console.log("Usuário não possui conta QuickBooks conectada. Pulando atualização no QB.");

              // Adicionar evento na timeline sobre conta não conectada
              await prisma.invoiceTimeline.create({
                data: {
                  description: `QuickBooks invoice update skipped (no QuickBooks account connected)`,
                  invoice: {
                    connect: { id: invoiceId }
                  }
                }
              });
            } else {
              console.log("Invoice não possui referência do QuickBooks. Criando referencia.");

              // TENTAR DE CRIAÇÃO DE INVOICE NO QBO
              const qbServicesSource =
                Array.isArray(services) && services.length > 0
                  ? services
                  : (existingInvoice.InvoiceItems || []).map((ii: any) => ({
                    name: ii.name || "Service",
                    description: ii.description || "",
                    quantity: Number(ii.quantity || 1),
                    price: Number(ii.price || 0),
                    total: Number(ii.totalAmount || 0),
                  }));

              const qbServicesForCreate = qbServicesSource.map((s: any) => ({
                name: s.name || "Service",
                description: s.description || "",
                quantity: Number(s.quantity || 1),
                price: Number(s.price || 0),
                total: Number(
                  s.total != null ? s.total : (Number(s.quantity || 0) * Number(s.price || 0))
                ),
              }));

              const qbController = this.quickBooksController;
              if (!qbController) throw new Error("QuickBooksController is not initialized");

              const createResult = await qbController.createInvoiceInternal({
                projectId: project.id,
                description: description || `Invoice for Project ${project.contract_number}`,
                type_invoicebase: (existingInvoice as any).type_invoicebase, // se existir no modelo
                dueDate: dueDate,
                userId: userId,
                coefficientPerfentage: coefficientPerfentage,
                services: qbServicesForCreate,
                type_value: type_value,
                totalAmountTarget: (totalAmount ?? 0),
                calledFromStripe: true,
              });

              console.log("Invoice criado no QuickBooks com sucesso:", createResult?.quickbooksId);

              // Atualizar a fatura local com os identificadores do QuickBooks
              if (createResult?.quickbooksId) {
                await prisma.invoice.update({
                  where: { id: invoiceId },
                  data: {
                    idQuickbookContabio: createResult.quickbooksId,
                    docNumberQuickBooksContabio: createResult.docNumber || null,
                    idQuickBooksRef: createResult.quickbooksId,
                    externalDocNumber: createResult.docNumber || null,
                    qboCustomerRef: createResult.qboCustomerRef || null,
                  },
                });
              }

              // Timeline de sucesso
              await prisma.invoiceTimeline.create({
                data: {
                  description: `QuickBooks invoice created successfully (ID: ${createResult?.quickbooksId}, DocNumber: ${createResult?.docNumber})`,
                  invoice: { connect: { id: invoiceId } },
                },
              });

              // Para manter a estrutura do retorno
              quickBooksUpdateResult = createResult;
            }
          }
        }
      } catch (qbError: any) {
        console.error("Erro ao atualizar invoice no QuickBooks:", qbError.message);
        quickBooksUpdateError = qbError.message;

        // Adicionar evento na timeline sobre erro no QuickBooks
        try {
          await prisma.invoiceTimeline.create({
            data: {
              description: `Failed to update QuickBooks invoice: ${qbError.message}`,
              invoice: {
                connect: { id: invoiceId }
              }
            }
          });
        } catch (timelineError) {
          console.error("Erro ao registrar falha do QuickBooks na timeline:", timelineError);
        }
      }

      return res.status(200).json({
        message: "Invoice updated successfully",
        invoice: updatedInvoice,
        quickBooks: {
          success: !!quickBooksUpdateResult,
          result: quickBooksUpdateResult,
          error: quickBooksUpdateError
        }
      });
    } catch (error: any) {
      console.error("Error updating invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async generateNumber(req: Request, res: Response) {
    const { projectId } = req.params;

    try {
      // Buscar o projeto
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          company: true,
        },
      });

      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Buscar todos os invoices com externalInvoiceId numérico para a empresa
      const allInvoices = await prisma.invoice.findMany({
        where: {
          companyId: project.company_id,
          // invoiceType: { in: ["custom", "quickbooks"] },
          externalInvoiceId: { not: null }
        },
        select: {
          externalInvoiceId: true
        }
      });

      // Extrair apenas os números válidos e encontrar o maior
      const numericIds = allInvoices
        .map(invoice => parseInt(invoice.externalInvoiceId || ""))
        .filter(num => !isNaN(num) && num > 0);

      // Definir o número do invoice como o próximo número após o maior encontrado, ou 1000 se não houver
      let nextInvoiceNumber = 1000;
      if (numericIds.length > 0) {
        const maxNumber = Math.max(...numericIds);
        nextInvoiceNumber = maxNumber + 1;
      }

      return res.status(200).json({
        number: nextInvoiceNumber.toString(),
        projectId: projectId,
        invoiceType: "custom"
      });
    } catch (error: any) {
      console.error("Error generating custom invoice number:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async generateGlobalNumber(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      // Verificar se a empresa existe
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Buscar todos os invoices com externalInvoiceId numérico para a empresa
      const allInvoices = await prisma.invoice.findMany({
        where: {
          companyId: companyId,
          externalInvoiceId: { not: null }
        },
        select: {
          externalInvoiceId: true
        }
      });

      // Extrair apenas os números válidos e encontrar o maior
      const numericIds = allInvoices
        .map(invoice => parseInt(invoice.externalInvoiceId || ""))
        .filter(num => !isNaN(num) && num > 0);

      // Definir o número do invoice como o próximo número após o maior encontrado, ou 1000 se não houver
      let nextInvoiceNumber = 1000;
      if (numericIds.length > 0) {
        const maxNumber = Math.max(...numericIds);
        nextInvoiceNumber = maxNumber + 1;
      }

      return res.status(200).json({
        number: nextInvoiceNumber.toString(),
        companyId: companyId,
        invoiceType: "custom"
      });
    } catch (error: any) {
      console.error("Error generating global invoice number:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async deleteInvoice(req: Request, res: Response) {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: "Invoice ID is required"
      })
    }

    const invoice = await prisma.invoice.findUnique({
      where: {
        id
      }
    })

    if (!invoice) {
      return res.status(404).json({
        error: "Invoice not found"
      })
    }

    if (invoice.status === "paid") {
      return res.status(400).json({
        error: "Invoice is already paid, cannot be deleted"
      })
    }

    try {
      // If custom invoice has administrative QB invoice, delete it too
      let quickBooksDeleteResult = null;
      let quickBooksDeleteError = null;

      if (invoice.idQuickbookContabio && invoice.docNumberQuickBooksContabio) {
        console.log("Custom invoice has administrative QB invoice - deleting it...");
        console.log("QB Invoice ID:", invoice.idQuickbookContabio);

        try {
          const qbController = this.quickBooksController;
          if (qbController && invoice.user_id && invoice.companyId) {
            quickBooksDeleteResult = await qbController.deleteInvoiceInternal({
              quickBooksInvoiceId: invoice.idQuickbookContabio,
              userId: invoice.user_id,
              companyId: invoice.companyId,
              calledFromStripe: true // Internal operation, don't delete from local DB
            });

            if (quickBooksDeleteResult.success || quickBooksDeleteResult.notFound) {
              console.log("Administrative QB invoice deleted successfully");
            } else {
              console.warn("Failed to delete administrative QB invoice, continuing anyway...");
            }
          }
        } catch (qbError: any) {
          console.warn("Error deleting administrative QB invoice:", qbError.message);
          quickBooksDeleteError = qbError.message;
          // Continue with local deletion despite QB error
        }
      }

      await prisma.invoice.delete({
        where: {
          id
        }
      })

      return res.status(200).json({
        message: "Invoice deleted successfully",
        quickBooks: quickBooksDeleteResult ? {
          success: true,
          result: quickBooksDeleteResult
        } : undefined,
        quickBooksError: quickBooksDeleteError
      })
    } catch (error) {
      return res.status(500).json({
        error: "Internal Server Error"
      })
    }

  }

  /**
   * Busca uma invoice custom para visualização pública (similar ao startPayment do PaymentElement)
   * Rota pública - não requer autenticação
   */
  async getCustomInvoicePublic(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      console.log("Buscando invoice custom para visualização:", invoiceId);

      // Buscar invoice com relacionamentos
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          project: {
            include: {
              client: true,
              company: true
            }
          },
          InvoiceItems: true,
          payment: true,
          PdfProject: true
        }
      });

      if (!invoice) {
        return res.status(404).json({
          error: "Invoice not found"
        });
      }

      // Verificar se é do tipo custom
      if (invoice.invoiceType !== 'custom') {
        return res.status(400).json({
          error: "This invoice is not a custom invoice"
        });
      }

      // Verificar se invoice está void
      if (invoice.status === 'void') {
        return res.status(400).json({
          error: "Invoice is void"
        });
      }

      if (!invoice.project || !invoice.project.company || !invoice.project.client) {
        return res.status(404).json({
          error: "Invoice, project, company, or client not found"
        });
      }

      const company = invoice.project.company;
      const client = invoice.project.client;

      // Registrar visualização no timeline
      // try {
      //   await prisma.invoiceTimeline.create({
      //     data: {
      //       description: "Invoice viewed",
      //       invoice: {
      //         connect: {
      //           id: invoiceId
      //         }
      //       }
      //     }
      //   });
      // } catch (timelineError) {
      //   console.warn("Erro ao registrar visualização no timeline:", timelineError);
      //   // Não falhar a requisição se o timeline falhar
      // }

      // Preparar resposta
      const response = {
        invoice: {
          id: invoice.id,
          externalInvoiceId: invoice.externalInvoiceId || invoice.id,
          status: invoice.status,
          totalAmount: Number(invoice.totalAmount),
          currency: invoice.currency || 'usd',
          dueDate: invoice.dueDate?.toISOString() || null,
          description: invoice.description,
          createdAt: invoice.createdAt.toISOString(),
          invoiceType: invoice.invoiceType
        },
        company: {
          id: company.id,
          name: company.name,
          email: company.email,
          phone: company.phone
        },
        client: {
          id: client.id,
          name: client.name,
          email: client.email,
          phone: client.phone
        },
        invoiceItems: invoice.InvoiceItems.map(item => ({
          id: item.id,
          name: item.name,
          description: item.description,
          quantity: Number(item.quantity),
          price: Number(item.price),
          totalAmount: Number(item.totalAmount)
        })),
        payment: invoice.payment ? {
          id: invoice.payment.id,
          paymentMethod: invoice.payment.paymentMethod,
          notes: invoice.payment.notes,
          amount: invoice.payment.amount,
          paidAt: invoice.payment.paidAt.toISOString()
        } : null
      };

      return res.status(200).json(response);

    } catch (error) {
      console.error("Erro ao buscar invoice custom:", error);
      return res.status(500).json({
        error: "Internal Server Error"
      });
    }
  }

  /**
   * Busca o PDF de uma invoice custom (rota pública)
   */
  async getCustomInvoicePdf(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      console.log("Buscando PDF para invoice custom:", invoiceId);

      // Buscar invoice com PDFs relacionados
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          PdfProject: true
        }
      });

      if (!invoice) {
        return res.status(404).json({
          error: "Invoice not found"
        });
      }

      // Verificar se é do tipo custom
      if (invoice.invoiceType !== 'custom') {
        return res.status(400).json({
          error: "This invoice is not a custom invoice"
        });
      }

      // Verificar se existe PDF
      if (!invoice.PdfProject || invoice.PdfProject.length === 0) {
        return res.status(404).json({
          error: "No PDF found for this invoice"
        });
      }

      // Pegar o primeiro PDF (assumindo que há apenas um por invoice)
      const pdf = invoice.PdfProject[0];

      if (!pdf.uri) {
        return res.status(404).json({
          error: "PDF URI not found"
        });
      }

      // Gerar URL presigned para o PDF
      const pdfUrl = await getPresignedUrl(pdf.uri);

      console.log("PDF URL gerada com sucesso");

      return res.status(200).json({
        pdfUrl: pdfUrl,
        fileName: pdf.original_file_name || 'invoice.pdf'
      });

    } catch (error) {
      console.error("Erro ao buscar PDF da invoice custom:", error);
      return res.status(500).json({
        error: "Internal Server Error"
      });
    }
  }

  async sendInvoicePaid(req: Request, res: Response) {
    const { invoiceId, userId, companyId, pdfInvoicePaidId, customSubject, customBody, customEmails } = req.body;

    try {
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      if (!companyId) {
        return res.status(400).json({ error: "Company ID is required" });
      }

      if (!pdfInvoicePaidId) {
        return res.status(400).json({ error: "PDF Invoice Paid ID is required" });
      }

      // Validar customEmails se fornecido
      let emailsToSend = [];
      if (customEmails && Array.isArray(customEmails) && customEmails.length > 0) {
        // Validar cada email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const invalidEmails = customEmails.filter(email => !emailRegex.test(email));
        if (invalidEmails.length > 0) {
          return res.status(400).json({
            error: "Invalid email addresses in customEmails",
            invalidEmails
          });
        }
        emailsToSend = customEmails;
      }

      // Buscar a fatura com todas as informações necessárias
      const invoice = await prisma.invoice.findFirst({
        where: {
          id: invoiceId,
          companyId: companyId,
        },
        include: {
          project: {
            include: {
              client: true,
              company: true
            }
          },
          InvoiceItems: true,
          payment: true
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.status !== "paid") {
        return res.status(400).json({ error: "Invoice is not marked as paid" });
      }

      if (!invoice.project?.client) {
        return res.status(400).json({ error: "Client not found for this invoice" });
      }

      // Se não foram fornecidos customEmails, usar o email do cliente
      if (emailsToSend.length === 0) {
        if (!invoice.project.client.email) {
          return res.status(400).json({ error: "Client email is required when customEmails is not provided" });
        }
        emailsToSend = [invoice.project.client.email];
      }

      // Buscar o PDF de pagamento para usar como anexo
      const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
        where: { id: pdfInvoicePaidId }
      });

      if (!pdfInvoicePaid || !pdfInvoicePaid.uri) {
        return res.status(404).json({ error: "PDF Invoice Paid not found or has no URI" });
      }

      const documentsAttachments = await prisma.imagesAttachments.findMany({
        where: {
          invoiceId: invoice.id,
          type_images_attachments: "document"
        }
      });

      // Gerar URL presigned para o PDF
      const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);

      // Baixar o PDF do S3
      const pdfResponse = await fetch(pdfUrl);
      if (!pdfResponse.ok) {
        throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
      }
      const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

      const documentAttachments = [];
      if (documentsAttachments && documentsAttachments.length > 0) {
        for (const document of documentsAttachments) {
          try {
            if (document.url) {
              const documentUrl = await getPresignedUrl(document.url);
              const documentResponse = await fetch(documentUrl);

              if (documentResponse.ok) {
                const documentBuffer = Buffer.from(await documentResponse.arrayBuffer());
                const fileName = document.original_filename || document.title || `document_${document.id}`;
                const contentType = documentResponse.headers.get('content-type') || 'application/octet-stream';

                documentAttachments.push({
                  filename: fileName,
                  content: documentBuffer,
                  contentType: contentType
                });
              }
            }
          } catch (error) {
            console.error(`Error fetching document attachment ${document.id}:`, error);
          }
        }
      }

      // Obter o logo da empresa
      const company = invoice.project.company;
      const companyAvatar = company?.avatar ? await getPresignedUrl(company.avatar) : "";

      // Preparar os dados para o template
      const companyName = company?.name || 'Smart Build';
      const clientName = invoice.project.client.name;
      const totalFormatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(Number(invoice.totalAmount));
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);
      const projectDispName = `Project #${invoice.project?.contract_number || 'N/A'}`;
      const paymentDateFormatted = formatInvoicePaymentDate(invoice.payment?.paidAt || invoice.payment?.createdAt || invoice.updatedAt);

      const emailSubject = customSubject || `Payment Received - Invoice #${invoiceCode} - ${companyName}`;

      // Resultados do envio para cada email
      const results = [];

      // Processar todos os emails
      for (const email of emailsToSend) {
        try {
          const attachments = [
            {
              filename: pdfInvoicePaid.original_file_name || `payment_receipt_${invoiceCode}.pdf`,
              content: pdfBuffer.toString('base64'),
              type: 'application/pdf',
              disposition: 'attachment'
            },
            ...documentAttachments.map(doc => ({
              filename: doc.filename,
              content: doc.content.toString('base64'),
              type: doc.contentType,
              disposition: 'attachment'
            }))
          ];

          await sendEmail({
            to: email,
            subject: emailSubject,
            templateId: "d-b6e6e8ed26f14399a3ecceb89a6dee03",
            dynamicTemplateData: {
              recipientName: clientName,
              projectName: projectDispName,
              invoiceNumber: invoiceCode,
              totalAmount: totalFormatted,
              paymentDate: paymentDateFormatted,
              companyName: companyName,
              companyReplyToEmail: company?.email || "",
              companyAvatar: companyAvatar,
              customBody: customBody || "",
              currentYear: new Date().getFullYear().toString(),
              recipientEmail: email,
              location: invoice.project?.location || "Not specified"
            },
            attachments: attachments as any
          });

          // Se chegou aqui, o envio foi bem-sucedido
          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: email,
              status: "success",
              sentAt: new Date()
            }
          });

          // Registrar o envio no histórico
          await prisma.invoiceSendHistory.create({
            data: {
              invoiceId: invoice.id,
              recipient: email,
              user_id: userId
            }
          });

          results.push({ email, status: "success" });

          // Registrar evento na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `Payment receipt sent to ${email}`,
              invoice: {
                connect: { id: invoice.id }
              }
            }
          });
        } catch (error: any) {
          // Registrar o erro no log
          await prisma.invoiceEmailLog.create({
            data: {
              invoice: { connect: { id: invoice.id } },
              recipient: email,
              status: "error",
              errorMessage: error.message || "Unknown error",
              sentAt: new Date()
            }
          });

          results.push({ email, status: "error", message: error.message });

          // Registrar evento na timeline
          await prisma.invoiceTimeline.create({
            data: {
              description: `Failed to send payment receipt to ${email}: ${error.message}`,
              invoice: {
                connect: { id: invoice.id }
              }
            }
          });
        }
      }

      // Verificar se pelo menos um email foi enviado com sucesso
      const successfulSends = results.filter(r => r.status === "success");

      return res.status(200).json({
        message: successfulSends.length > 0 ? "Payment receipt sent successfully" : "Failed to send payment receipt to all recipients",
        success: successfulSends.length > 0,
        results,
        totalSent: successfulSends.length,
        totalAttempted: emailsToSend.length
      });
    } catch (error) {
      console.error("Error sending payment confirmation email:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 
