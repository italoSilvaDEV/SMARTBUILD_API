import { Request, Response } from "express";
import { StripeController } from "../stripe/StripeController";
import { QuickBooksInvoiceController } from "../quickbooks/QuickBooksInvoiceController";
import { CustomInvoiceController } from "./CustomInvoiceController";
import { prisma } from "../../utils/prisma";

export class UnifiedInvoiceController {
  private stripeController: StripeController;
  private quickBooksController: QuickBooksInvoiceController;
  private customInvoiceController: CustomInvoiceController;

  constructor() {
    this.stripeController = new StripeController();
    this.quickBooksController = new QuickBooksInvoiceController();
    this.customInvoiceController = new CustomInvoiceController();
  }

  async createInvoice(req: Request, res: Response) {
    const { invoiceType } = req.body;

    switch (invoiceType) {
      case "stripe":
        return this.stripeController.createInvoice(req, res);
      case "quickbooks":
        return this.quickBooksController.createInvoice(req, res);
      case "custom":
        return this.customInvoiceController.createInvoice(req, res);
      default:
        return res.status(400).json({ error: "Invalid invoice type. Must be 'stripe', 'quickbooks', or 'custom'." });
    }
  }

  async getInvoicesByProject(req: Request, res: Response) {
    const { projectId } = req.params;
    const { invoiceType, searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

    try {
      const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
      const itemsLimit = Number(itemsPerPage);
      const search = typeof searchTerm === 'string' ? searchTerm : "";

      // Construir o filtro base
      let filtro: any = {
        projectId,
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

      // Adicionar filtro por tipo se especificado
      if (invoiceType && ['stripe', 'quickbooks', 'custom'].includes(invoiceType as string)) {
        filtro.invoiceType = invoiceType;
      }

      // Buscar invoices
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

      // Processar cada invoice de acordo com seu tipo
      const processedInvoices = invoices.map(invoice => {
        // Adicionar informação sobre o último envio
        const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
        return { ...invoice, lastSentAt: lastSend };
      });

      return res.status(200).json({ total, invoices: processedInvoices });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async sendInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Redirecionar para o controller apropriado com base no tipo de invoice
      switch (invoice.invoiceType) {
        case "stripe":
          return this.stripeController.sendInvoice(req, res);
        case "quickbooks":
          return this.quickBooksController.sendInvoice(req, res);
        case "custom":
          return this.customInvoiceController.sendInvoice(req, res);
        default:
          return res.status(400).json({ error: "Invalid invoice type" });
      }
    } catch (error) {
      console.error("Error sending invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async cancelInvoice(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Redirecionar para o controller apropriado com base no tipo de invoice
      switch (invoice.invoiceType) {
        case "stripe":
          return this.stripeController.cancelInvoice(req, res);
        case "quickbooks":
          return this.quickBooksController.cancelInvoice(req, res);
        case "custom":
          return this.customInvoiceController.updateInvoiceStatus(req, res);
        default:
          return res.status(400).json({ error: "Invalid invoice type" });
      }
    } catch (error) {
      console.error("Error canceling invoice:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async getInvoicesByCompany(req: Request, res: Response) {
    const { companyId } = req.params;
    const { invoiceType, searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

    try {
      const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
      const itemsLimit = Number(itemsPerPage);
      const search = typeof searchTerm === 'string' ? searchTerm : "";

      // Construir o filtro base
      let filtro: any = {
        companyId,
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
          },
          {
            externalInvoiceId: {
              contains: search,
            }
          }
        ]
      };

      // Adicionar filtro por tipo se especificado
      if (invoiceType && ['stripe', 'quickbooks', 'custom'].includes(invoiceType as string)) {
        filtro.invoiceType = invoiceType;
      }

      // Buscar invoices
      const invoices = await prisma.invoice.findMany({
        where: filtro,
        orderBy: { createdAt: "desc" },
        include: {
          company: true,
          InvoiceSendHistory: { orderBy: { sentAt: "desc" } },
          project: {
            include: {
              client: {
                select: { id: true, name: true, email: true }
              }
            }
          }
        },
        skip: pageNumber * itemsLimit,
        take: itemsLimit
      });

      const total = await prisma.invoice.count({ where: filtro });

      // Processar cada invoice de acordo com seu tipo
      const processedInvoices = await Promise.all(
        invoices.map(async (invoice) => {
          // Adicionar informação sobre o último envio
          const lastSend = invoice.InvoiceSendHistory[0]?.sentAt || null;
          
          // Aqui você pode adicionar lógica específica para cada tipo de invoice
          // Por exemplo, buscar status atualizado do Stripe ou QuickBooks
          
          return { ...invoice, lastSentAt: lastSend };
        })
      );

      return res.status(200).json({ total, invoices: processedInvoices });
    } catch (error) {
      console.error("Error fetching invoices:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 