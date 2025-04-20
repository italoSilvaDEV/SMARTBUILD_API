import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import fs from "fs";
import { generatePdf } from "../../utils/generatePdf";


interface InvoiceLineItem {
  name: string;
  description?: string;
  quantity: number;
  price: number;
}

export class CustomInvoiceController {
  async createInvoice(req: Request, res: Response) {
    const { projectId } = req.params;
    const { userId, coefficientPerfentage, description, dueDate, services, type_value } = req.body;

    try {
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

      // Preparar a data de vencimento
      const dueDateObj = dueDate ? new Date(dueDate) : new Date();

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
          totalAmount: totalAmount,
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

      // Registrar evento na timeline
      await prisma.invoiceTimeline.create({
        data: {
          description: `Created`,
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
    const { userId } = req.body;

    try {
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      // Buscar a fatura com todas as informações necessárias, incluindo fotos dos serviços
      const invoice = await prisma.invoice.findFirst({
        where: { 
          externalInvoiceId: invoiceId,
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
      const emailTemplate = invoiceCustom(clientName, urlLogo, invoiceCode, invoiceAmount, companyName, phone || '');

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

      const total = `$${Number(invoice.totalAmount).toFixed(2)}`;

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

      // Enviar o email com o PDF anexado
      await transporter.sendMail({
        from: SMTP_CONFIG.user,
        to: invoice.project.client.email,
        subject: `Invoice #${invoiceCode} - ${companyName}`,
        html: emailTemplate,
        attachments: [
          {
            filename: `invoice_${invoiceCode}.pdf`,
            path: pdfPath,
          },
        ],
      });

      // Registrar o envio no histórico
      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoice.id,
          recipient: invoice.project.client.email,
          user_id: userId
        }
      });

      // Remover o PDF após o envio
      setTimeout(() => {
        fs.unlinkSync(pdfPath);
      }, 5000);

      return res.status(200).json({
        message: "Invoice sent successfully",
        recipient: invoice.project.client.email
      });
    } catch (error) {
      console.error("Error sending custom invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  // Método utilitário para registrar eventos na timeline
  private async addInvoiceTimelineEvent(invoiceId: string, description: string) {
    try {
      return await prisma.invoiceTimeline.create({
        data: {
          description,
          invoice: {
            connect: { id: invoiceId }
          }
        }
      });
    } catch (error) {
      console.error("Error adding invoice timeline event:", error);
      // Não lançamos o erro para não interromper o fluxo principal
    }
  }

  async sendInvoiceMultiple(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId, emails } = req.body;

    try {
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }

      // Validar se emails é um array
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        return res.status(400).json({ error: "Please provide at least one email address" });
      }

      // Buscar a fatura com todas as informações necessárias
      const invoice = await prisma.invoice.findFirst({
        where: { 
          externalInvoiceId: invoiceId,
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
      const clientLocation = invoice.project.client?.location || '';
      const clientCityAndState = invoice.project.client?.city_and_state || '';
      const invoiceAmount = Number(invoice.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);

      // Usar o template invoiceCustom
      const { invoiceCustom } = require('../../templateEmail/invoiceCustom');
      const emailTemplate = invoiceCustom(clientName, urlLogo, invoiceCode, invoiceAmount, companyName, phone || '');

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

      const total = `$${Number(invoice.totalAmount).toFixed(2)}`;

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
        clientLocation,
        clientCityAndState,
      );

      columnText2.push(
        "Ship to",
        clientName,
        clientLocation,
        clientCityAndState,
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

      // Resultados do envio para cada email
      const results = [];

      // Processar todos os emails
      for (const email of emails) {
        try {
          // Enviar o email com o PDF anexado
          await transporter.sendMail({
            from: SMTP_CONFIG.user,
            to: email,
            subject: `Invoice #${invoiceCode} - ${companyName}`,
            html: emailTemplate,
            attachments: [
              {
                filename: `invoice_${invoiceCode}.pdf`,
                path: pdfPath,
              },
            ],
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

      // Remover o PDF após o envio
      setTimeout(() => {
        fs.unlinkSync(pdfPath);
      }, 5000);

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
    const { userId } = req.body;

    try {
      const invoice = await prisma.invoice.findFirst({
        where: { 
          externalInvoiceId: invoiceId,
          invoiceType: "custom"
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "custom") {
        return res.status(400).json({ error: "Not a custom invoice" });
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

    try {
      // Buscar a fatura com todas as informações necessárias
      const invoice = await prisma.invoice.findFirst({
        where: { 
          externalInvoiceId: invoiceId,
          // invoiceType: "custom"
        },
        include: {
          project: {
            include: {
              client: true,
              company: {
                include: {
                  NotesContrac: true // Incluir a relação NotesContrac
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
} 