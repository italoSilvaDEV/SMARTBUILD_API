import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import fs from "fs";
import { generatePdf } from "../../utils/generatePdf";
import { CreatePdfProjectEstimateInvoiceController } from "../projects/CreatePdfProjectEstimateInvoiceController";

export class CustomInvoiceController {
  async createInvoice(req: Request, res: Response) {
    const { projectId } = req.params;
    const { userId, coefficientPerfentage, description, dueDate, services, type_value, totalAmount } = req.body;

    try {
      // Validar se idPdfProject foi fornecido
      // if (!idPdfProject) {
      //   return res.status(400).json({ error: "PDF Project ID is required" });
      // }

      // Buscar o projeto
      const project = await prisma.project.findUnique({
        where: { id: projectId },
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

      // Validar se o PdfProject existe
      // const pdfProject = await prisma.pdfProject.findUnique({
      //   where: { id: idPdfProject }
      // });

      // if (!pdfProject) {
      //   return res.status(404).json({ error: "PDF Project not found" });
      // }

      // Preparar a data de vencimento
      const dueDateObj = dueDate ? new Date(dueDate) : new Date();

      // Calcular o valor total com base nos serviços e coeficiente
      let finalTotalAmount = 0;
      const lineItems = [];

      if (totalAmount && typeof totalAmount === 'number' && totalAmount > 0) {
        // Usar o totalAmount calculado no frontend
        finalTotalAmount = totalAmount;
        console.log('✅ Usando totalAmount do frontend:', finalTotalAmount);

        // Processar os services para criar lineItems, distribuindo proporcionalmente
        const originalServicesTotal = services.reduce((sum: number, item: any) => {
          const serviceTotal = item.total || (item.quantity * item.price) || 0;
          return sum + serviceTotal;
        }, 0);

        console.log('📊 Total original dos services:', originalServicesTotal);

        for (const item of services) {
          const quantity = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const serviceTotal = item.total || (quantity * price) || 0;

          // Calcular a proporção deste service no total
          const proportion = originalServicesTotal > 0 ? serviceTotal / originalServicesTotal : 0;
          const adjustedAmount = finalTotalAmount * proportion;

          console.log(`📊 Service "${item.name}": original=${serviceTotal}, proportion=${proportion.toFixed(4)}, adjusted=${adjustedAmount}`);

          lineItems.push({
            name: item.name,
            description: item.description || "",
            quantity: quantity,
            price: price,
            totalAmount: adjustedAmount
          });
        }
      } else {
        // Fallback: calcular como antes se totalAmount não for fornecido
        console.log('⚠️ totalAmount não fornecido, calculando internamente');

        for (const item of services) {
          const quantity = Number(item.quantity) || 0;
          const price = Number(item.price) || 0;
          const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 1;

          // Usar o total fornecido ou calcular se não estiver disponível
          const serviceAmount = item.total || (quantity * price);
          const adjustedAmount = serviceAmount * validCoefficient;

          if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
            continue;
          }

          finalTotalAmount += adjustedAmount;
          lineItems.push({
            name: item.name,
            description: item.description || "",
            quantity: quantity,
            price: price,
            totalAmount: adjustedAmount
          });
        }
      }

      // Obter o maior número de invoice para a empresa especificada
      const latestInvoice = await prisma.invoice.findFirst({
        where: {
          companyId: project.company_id,
          invoiceType: "custom",
          externalInvoiceId: { not: null }
        },
        orderBy: [
          { createdAt: "desc" },
          { externalInvoiceId: "desc" }
        ]
      });

      // Definir o número do invoice como o próximo número após o maior encontrado, ou 1000 se não houver
      let nextInvoiceNumber = 1000;
      if (latestInvoice && latestInvoice.externalInvoiceId) {
        // Tentar extrair o número do último invoice
        const lastNumber = parseInt(latestInvoice.externalInvoiceId);
        if (!isNaN(lastNumber)) {
          nextInvoiceNumber = lastNumber + 1;
        }
      }

      // Criar a fatura personalizada no banco de dados
      const newInvoice = await prisma.invoice.create({
        data: {
          externalInvoiceId: nextInvoiceNumber.toString(), // Usar o número sequencial
          invoiceType: "custom",
          status: "open",
          totalAmount: finalTotalAmount, // Usar o totalAmount calculado
          dueDate: dueDateObj,
          description: description,
          projectId: project.id,
          companyId: project.company_id,
          user_id: userId,
          type_value: type_value,
          percentageCoefficient: coefficientPerfentage,
          // Criar os itens da fatura
          InvoiceItems: {
            create: lineItems.map((item) => ({
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          InvoiceItems: true // Incluir os itens na resposta
        }
      });

      // Atualizar o PdfProject com o invoice_id
      // await prisma.pdfProject.update({
      //   where: { id: idPdfProject },
      //   data: {
      //     invoice_id: newInvoice.id,
      //     project_id: project.id
      //   }
      // });

      // Registrar evento na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `Created with total amount $${finalTotalAmount}`,
          invoice: {
            connect: { id: newInvoice.id }
          }
        }
      });

      return res.status(201).json({
        message: "Custom invoice created successfully",
        invoice: newInvoice
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

  // enviar o pdf para o cliente atravez de email
  async sendInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId, companyId, idPdfProject, customSubject, customBody } = req.body;

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

      // Buscar a fatura com todas as informações necessárias
      const invoice = await prisma.invoice.findFirst({
        where: {
          externalInvoiceId: invoiceId,
          companyId: companyId,
          invoiceType: "custom"
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

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      if (!invoice.project.client) {
        return res.status(400).json({ error: "Client not found for this invoice" });
      }

      if (!invoice.project.client.email) {
        return res.status(400).json({ error: "Client email is required" });
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

      // Configurar o envio de email
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: { rejectUnauthorized: false },
      });

      // Obter o logo da empresa
      const company = invoice.project.company;
      const urlLogo = company?.avatar ? await getPresignedUrl(company.avatar) : undefined;

      // Preparar os dados para o template
      const companyName = company?.name || 'Smart Build';
      const phone = company?.phone || '';
      const clientName = invoice.project.client.name;
      const invoiceAmount = Number(invoice.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);

      // Usar o template invoiceCustom
      const { invoiceCustom } = require('../../templateEmail/invoiceCustom');
      const emailTemplate = invoiceCustom(clientName, urlLogo, invoiceCode, invoiceAmount, companyName, phone || '', customBody);

      const fileName = pdfProject.original_file_name || `invoice_${invoiceCode}.pdf`;

      // Usar subject personalizado se fornecido, senão usar o padrão
      const emailSubject = customSubject || `Invoice #${invoiceCode} - ${companyName}`;

      // Enviar o email com o PDF anexado
      await transporter.sendMail({
        from: SMTP_CONFIG.user,
        to: invoice.project.client.email,
        subject: emailSubject,
        html: emailTemplate,
        attachments: [
          {
            filename: fileName,
            content: pdfBuffer,
            contentType: 'application/pdf'
          }
        ]
      });

      // Registrar o envio no histórico
      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoice.id,
          recipient: invoice.project.client.email,
          user_id: userId
        }
      });

      // Registrar evento na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `Sent to ${invoice.project.client.email}`,
          invoice: {
            connect: { id: invoice.id }
          }
        }
      });

      return res.status(200).json({
        message: "Invoice sent successfully",
        recipient: invoice.project.client.email
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
          invoiceType: "custom"
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

      if (invoice.invoiceType !== "custom") {
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

      // Configurar o envio de email
      const SMTP_CONFIG = require("../../config/smtp");
      const transporter = nodemailer.createTransport({
        host: SMTP_CONFIG.host,
        port: SMTP_CONFIG.port,
        secure: SMTP_CONFIG.port === 465,
        auth: {
          user: SMTP_CONFIG.user,
          pass: SMTP_CONFIG.pass,
        },
        tls: { rejectUnauthorized: false },
      });

      // Obter o logo da empresa
      const company = invoice.project.company;
      const urlLogo = company?.avatar ? await getPresignedUrl(company.avatar) : undefined;

      // Preparar os dados para o template
      const companyName = company?.name || 'Smart Build';
      const phone = company?.phone || '';
      const clientName = invoice.project.client?.name || 'Cliente';
      const invoiceAmount = Number(invoice.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);

      // Usar o template invoiceCustom
      const { invoiceCustom } = require('../../templateEmail/invoiceCustom');
      const emailTemplate = invoiceCustom(clientName, urlLogo, invoiceCode, invoiceAmount, companyName, phone || '');

      // Resultados do envio para cada email
      const results = [];

      // Processar todos os emails
      for (const email of emails) {
        try {
          // Preparar opções de email
          const mailOptions: any = {
            from: SMTP_CONFIG.user,
            to: email,
            subject: `Invoice #${invoiceCode} - ${companyName}`,
            html: emailTemplate
          };

          // Adicionar anexo apenas se houver PDF disponível
          if (pdfBuffer && fileName) {
            mailOptions.attachments = [
              {
                filename: fileName,
                content: pdfBuffer,
                contentType: 'application/pdf'
              }
            ];
          }

          // Enviar o email
          await transporter.sendMail(mailOptions);

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
          externalInvoiceId: invoiceId,
          companyId: companyId,
          invoiceType: "custom"
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      // Buscar PDF relacionado ao invoice para excluir
      const pdfProject = await prisma.pdfProject.findFirst({
        where: { invoice_id: invoice.id },
        include: {
          fildsPdfProjects: true // Incluir os registros relacionados
        }
      });

      // Excluir registros relacionados se houver
      if (pdfProject) {
        try {
          // Primeiro excluir todos os registros de fildsPdfProject relacionados ao PdfProject
          if (pdfProject.fildsPdfProjects.length > 0) {
            await prisma.fildsPdfProject.deleteMany({
              where: { pdfProjectId: pdfProject.id }
            });
          }

          // Excluir também os registros de fildsPdfProject relacionados diretamente ao invoice
          await prisma.fildsPdfProject.deleteMany({
            where: { invoiceId: invoice.id }
          });

          // Excluir o PdfProject (arquivo do S3 e registro do banco)
          const pdfController = new CreatePdfProjectEstimateInvoiceController();
          await pdfController.deletePdfProject(pdfProject.id);
        } catch (error) {
          console.error("Error deleting PDF and related records:", error);
          // Continuar mesmo se não conseguir excluir os arquivos relacionados
        }
      }

      // Atualizar o status da fatura para cancelado
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "void" }
      });

      // Registrar evento na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `Canceled`,
          invoice: {
            connect: { id: invoice.id }
          }
        }
      });

      return res.status(200).json({
        message: "Invoice cancelled successfully"
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
        invoice.project.client.location || "",
        invoice.project.client.city_and_state || "",
      );

      columnText2.push(
        "Ship to",
        clientName,
        invoice.project.client.location || "",
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
    const { invoiceId } = req.params;
    const { userId, coefficientPerfentage, description, dueDate, services, type_value, idPdfProject } = req.body;

    try {
      // Verificar se o invoice existe
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
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (existingInvoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
      }

      // Buscar PDF relacionado ao invoice atual para excluir
      const existingPdfProject = await prisma.pdfProject.findFirst({
        where: { invoice_id: existingInvoice.id }
      });

      // Excluir o PDF existente se houver
      if (existingPdfProject) {
        try {
          const pdfController = new CreatePdfProjectEstimateInvoiceController();
          await pdfController.deletePdfProject(existingPdfProject.id);
        } catch (error) {
          console.error("Error deleting existing PDF:", error);
          // Continuar mesmo se não conseguir excluir o PDF anterior
        }
      }

      // Validar se o novo PdfProject existe (se fornecido)
      if (idPdfProject) {
        const pdfProject = await prisma.pdfProject.findUnique({
          where: { id: idPdfProject }
        });

        if (!pdfProject) {
          return res.status(404).json({ error: "PDF Project not found" });
        }
      }

      // Preparar a data de vencimento atualizada
      const dueDateObj = dueDate ? new Date(dueDate) : existingInvoice.dueDate;

      // Calcular o valor total com base nos serviços e coeficiente
      let totalAmount = 0;
      const lineItems = [];

      for (const item of services) {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 1;

        // Usar o total fornecido ou calcular se não estiver disponível
        const serviceAmount = item.total || (quantity * price);
        const adjustedAmount = serviceAmount * validCoefficient;

        if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
          continue;
        }

        totalAmount += adjustedAmount;
        lineItems.push({
          name: item.name,
          description: item.description || "",
          quantity: quantity,
          price: price,
          totalAmount: adjustedAmount
        });
      }

      // Primeiro excluir todos os itens existentes
      await prisma.invoiceItem.deleteMany({
        where: {
          invoiceId: existingInvoice.id
        }
      });

      // Atualizar o invoice com os novos valores e criar novos itens
      const updatedInvoice = await prisma.invoice.update({
        where: {
          id: invoiceId
        },
        data: {
          totalAmount: totalAmount,
          dueDate: dueDateObj,
          description: description || existingInvoice.description,
          type_value: type_value || existingInvoice.type_value,
          percentageCoefficient: coefficientPerfentage,
          updatedAt: new Date(),
          // Criar os novos itens da fatura
          InvoiceItems: {
            create: lineItems.map((item) => ({
              name: item.name,
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              totalAmount: item.totalAmount
            }))
          }
        },
        include: {
          InvoiceItems: true
        }
      });

      // Atualizar o novo PdfProject com o invoice_id (se fornecido)
      if (idPdfProject) {
        await prisma.pdfProject.update({
          where: { id: idPdfProject },
          data: {
            invoice_id: updatedInvoice.id,
            project_id: updatedInvoice.projectId
          }
        });
      }

      // Registrar evento na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `Updated with ${lineItems.length} items and total amount of $${totalAmount.toFixed(2)}`,
          invoice: {
            connect: { id: existingInvoice.id }
          }
        }
      });

      return res.status(200).json({
        message: "Invoice updated successfully",
        invoice: updatedInvoice
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

      // Obter o maior número de invoice para a empresa especificada
      const latestInvoice = await prisma.invoice.findFirst({
        where: {
          companyId: project.company_id,
          invoiceType: "custom",
          externalInvoiceId: { not: null }
        },
        orderBy: [
          { createdAt: "desc" },
          { externalInvoiceId: "desc" }
        ]
      });

      // Definir o número do invoice como o próximo número após o maior encontrado, ou 1000 se não houver
      let nextInvoiceNumber = 1000;
      if (latestInvoice && latestInvoice.externalInvoiceId) {
        // Tentar extrair o número do último invoice
        const lastNumber = parseInt(latestInvoice.externalInvoiceId);
        if (!isNaN(lastNumber)) {
          nextInvoiceNumber = lastNumber + 1;
        }
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
      await prisma.invoice.delete({
        where: {
          id
        }
      })

      return res.status(200).json({
        message: "Invoice deleted successfully",
      })
    } catch (error) {
      return res.status(500).json({
        error: "Internal Server Error"
      })
    }

  }
} 