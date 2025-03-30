import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

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

      // Criar a fatura personalizada no banco de dados
      const newInvoice = await prisma.invoice.create({
        data: {
          // stripeInvoiceId: `custom-${Date.now()}`, // Mantido para compatibilidade
          externalInvoiceId: `custom-${Date.now()}`, // Mantido para compatibilidade
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
    const { userId, emailSubject, emailBody } = req.body;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          project: {
            include: {
              client: true
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

      if (!invoice.project.client) {
        return res.status(400).json({ error: "Client not found for this invoice" });
      }

      if (!invoice.project.client.email) {
        return res.status(400).json({ error: "Client email is required" });
      }

      // Aqui você implementaria o envio de email
      // Por exemplo, usando nodemailer ou outro serviço de email

      // Registrar o envio no histórico
      await prisma.invoiceSendHistory.create({
        data: {
          invoiceId: invoice.id,
          recipient: invoice.project.client.email,
          user_id: userId
        }
      });

      // Atualizar o status da fatura
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "sent" }
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
      const invoice = await prisma.invoice.findUnique({
        where: { externalInvoiceId: invoiceId }
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