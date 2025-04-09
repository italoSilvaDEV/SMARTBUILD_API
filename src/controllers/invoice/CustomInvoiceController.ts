import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

interface InvoiceLineItem {
  name: string;
  description?: string;
  quantity: number;
  price: number;
}

export class CustomInvoiceController {
  async createInvoice(req: Request, res: Response) {
    const { projectId } = req.params;
    const { userId, coefficientPerfentage, description, dueDate } = req.body;

    try {
      // Buscar o projeto
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          client: true,
          serviceProject: true,
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
      dueDateObj.setDate(dueDateObj.getDate() + 30); // 30 dias por padrão se não especificado

      // Calcular o valor total com base nos serviços e coeficiente
      let totalAmount = 0;
      const lineItems = [];

      for (const service of project.serviceProject) {
        const hours = Number(service.hours) || 0;
        const price = Number(service.price) || 0;
        const validCoefficient = typeof coefficientPerfentage === 'number' && !isNaN(coefficientPerfentage) ? coefficientPerfentage : 0;

        const serviceAmount = hours * price;
        const adjustedAmount = serviceAmount * validCoefficient;

        if (isNaN(adjustedAmount) || adjustedAmount <= 0) {
          continue;
        }

        totalAmount += adjustedAmount;

        lineItems.push({
          name: service.name,
          description: service.description || "",
          quantity: hours,
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
          // stripeInvoiceId: `custom-${Date.now()}`, // Mantido para compatibilidade
          externalInvoiceId: nextInvoiceNumber.toString(), // Usar o número sequencial
          invoiceType: "custom",
          status: "open",
          totalAmount: totalAmount,
          dueDate: dueDateObj,
          description: description,
          projectId: project.id,
          companyId: project.company_id,
          user_id: userId,
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

  async sendInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;
    const { userId } = req.body;

    try {
      // Verificar se o userId foi fornecido
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
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
              company: true
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
      const urlLogo = company?.avatar ? await getPresignedUrl(company.avatar) : '';

      // Preparar os dados para o template
      const companyName = company?.name || 'Smart Build';
      const phone = company?.phone || '';
      const clientName = invoice.project.client.name;
      const invoiceAmount = Number(invoice.totalAmount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const invoiceCode = invoice.externalInvoiceId || invoiceId.substring(0, 8);

      // Usar o template invoiceCustom
      const { invoiceCustom } = require('../../templateEmail/invoiceCustom');
      const emailTemplate = invoiceCustom(clientName, urlLogo, invoiceCode, invoiceAmount, companyName, phone || '');

      // Enviar o email
      await transporter.sendMail({
        from: SMTP_CONFIG.user,
        to: invoice.project.client.email,
        subject: `Invoice #${invoiceCode} - ${companyName}`,
        html: emailTemplate,
      });

      // Registrar o envio no histórico
      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoice.id,
          recipient: invoice.project.client.email,
          user_id: userId
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

      return res.status(200).json({
        message: "Invoice cancelled successfully"
      });
    } catch (error: any) {
      console.error("Error cancelling custom invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 