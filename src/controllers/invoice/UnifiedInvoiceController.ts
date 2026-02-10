import { Request, Response } from "express";
import { StripeController } from "../stripe/StripeController";
import { QuickBooksInvoiceController } from "../quickbooks/invoice/QuickBooksInvoiceController";
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

  async getInvoiceById(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          InvoiceItems: {
            orderBy: { createdAt: 'asc' }
          },
          company: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true
            }
          },
          project: {
            include: {
              client: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  phone: true,
                  location: true
                }
              }
            }
          },
          PdfProject: true,
          InvoiceSendHistory: {
            orderBy: { sentAt: 'desc' },
            take: 5
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      return res.status(200).json(invoice);
    } catch (error) {
      console.error("Error fetching invoice by ID:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async getInvoicesByProject(req: Request, res: Response) {
    const { projectId } = req.params;
    const { invoiceType, searchTerm = "", page = 1, itemsPerPage = 10 } = req.query;

    const userId = (req as any).userId as string | undefined;
    let invoiceFilterByUser: any = {};
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { invoiceEditAll: true },
      });

      // Verificar se o usuário é project manager deste projeto
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { project_manager_id: true },
      });

      const isProjectManager = project?.project_manager_id === userId;

      // Se não tem invoiceEditAll E não é project manager do projeto, filtrar por permissões
      if (user?.invoiceEditAll !== true && !isProjectManager) {
        // Ver apenas invoices criadas pelo usuário OU onde ele é project manager do invoice
        invoiceFilterByUser = {
          OR: [
            { user_id: userId },
            { project_manager_id: userId },
          ],
        };
      }
      // Se tem invoiceEditAll OU é project manager do projeto, não filtra (vê todos os invoices do projeto)
    }

    try {
      const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
      const itemsLimit = Number(itemsPerPage);
      const search = typeof searchTerm === 'string' ? searchTerm : "";

      // Construir o filtro base
      let filtro: any = {
        projectId,
        AND: [
          ...(Object.keys(invoiceFilterByUser).length > 0 ? [invoiceFilterByUser] : []),
          {
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

    const userId = (req as any).userId as string | undefined;
    let invoiceFilterByUser: any = {};
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { invoiceEditAll: true },
      });
      if (user?.invoiceEditAll !== true) {
        // Ver invoices criadas pelo usuário OU onde o usuário é project manager do projeto OU do invoice
        invoiceFilterByUser = {
          OR: [
            { user_id: userId },
            { project: { project_manager_id: userId } },
            { project_manager_id: userId },
          ],
        };
      }
    }

    try {
      const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
      const itemsLimit = Number(itemsPerPage);
      const search = typeof searchTerm === 'string' ? searchTerm : "";

      // Construir o filtro base
      let filtro: any = {
        companyId,
        AND: [
          ...(Object.keys(invoiceFilterByUser).length > 0 ? [invoiceFilterByUser] : []),
          {
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
          },
          project_manager: {
            select: {
              id: true,
              name: true,
              email: true,
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

  async getQboPayments(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      console.log(` Buscando pagamentos QBO para invoice: ${invoiceId}`);

      // Buscar o invoice
      const invoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { id: invoiceId },
            { externalInvoiceId: invoiceId }
          ]
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      if (invoice.invoiceType !== "quickbooks") {
        return res.status(400).json({ error: "Not a QuickBooks invoice" });
      }

      // Buscar os pagamentos aplicados a este invoice
      const paymentApplications = await prisma.paymentApplication.findMany({
        where: {
          invoiceId: invoice.id
        },
        include: {
          paymentTransaction: true
        },
        orderBy: {
          appliedAt: 'desc'
        }
      });

      // Formatar os dados para o frontend
      const payments = paymentApplications.map(app => ({
        id: app.id,
        externalPaymentId: app.paymentTransaction.externalPaymentId,
        totalAmount: app.paymentTransaction.totalAmount,
        amountApplied: app.amountApplied,
        txnDate: app.paymentTransaction.txnDate,
        paymentMethodType: app.paymentTransaction.paymentMethodType,
        appliedAt: app.appliedAt
      }));

      console.log(` Encontrados ${payments.length} pagamentos para o invoice`);

      return res.status(200).json({
        success: true,
        payments
      });

    } catch (error: any) {
      console.error(" Erro ao buscar pagamentos QBO:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to fetch QBO payments"
      });
    }
  }

  async linkInvoiceToProject(req: Request, res: Response) {
    const { id } = req.params;
    const { projectId } = req.body;

    try {
      console.log(`[UnifiedInvoiceController] Linking invoice ${id} to project ${projectId}`);

      // Verificar se o invoice existe
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          project: {
            include: {
              serviceProject: true,
              estimates: {
                include: {
                  serviceProjects: true
                }
              },
              pdfproject: true
            }
          }
        }
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // Verificar se o novo projeto existe
      const newProject = await prisma.project.findUnique({
        where: { id: projectId }
      });

      if (!newProject) {
        return res.status(404).json({ error: "Target project not found" });
      }

      // Verificar se é a primeira vez que o invoice está sendo vinculado
      const isFirstLinking = !invoice.hasBeenLinked;
      
      // Usar transação para garantir atomicidade
      const result = await prisma.$transaction(async (tx) => {
        // PRIMEIRO: Atualizar o invoice para apontar para o novo projeto
        
        const updatedInvoice = await tx.invoice.update({
          where: { id },
          data: {
            projectId: projectId,
            // isStandaloneInvoice: false, // Agora não é mais standalone
            hasBeenLinked: true // Marcar que já foi vinculado uma vez
          },
          include: {
            InvoiceItems: true,
            company: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true
              }
            },
            project: {
              include: {
                client: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    location: true
                  }
                }
              }
            },
            PdfProject: true
          }
        });

    
        if (isFirstLinking && invoice.isStandaloneInvoice && invoice.projectId && invoice.project) {
          const oldProjectId = invoice.projectId;
          

          // Excluir services do estimate (se existir)
          if (invoice.project.estimates && invoice.project.estimates.length > 0) {
            for (const estimate of invoice.project.estimates) {
              // Desvincular PDFs do estimate (NÃO deletar, apenas remover referência)
              await tx.pdfProject.updateMany({
                where: { estimate_id: estimate.id },
                data: { estimate_id: null }
              });

              await tx.estimateServiceProject.deleteMany({
                where: { estimateId: estimate.id }
              });
              
              // Excluir o estimate
              await tx.estimate.delete({
                where: { id: estimate.id }
              });
            }
          }

          // Excluir service projects do projeto
          await tx.serviceProject.deleteMany({
            where: { projectId: oldProjectId }
          });

          // Desvincular PDFs do projeto (NÃO deletar, apenas remover referência project_id)
          // Os PDFs continuam vinculados ao invoice
          await tx.pdfProject.updateMany({
            where: { project_id: oldProjectId },
            data: { project_id: null }
          });

          // Excluir InvoicePaymentTimeLine relacionados ao projeto
          await tx.invoicePaymentTimeLine.deleteMany({
            where: { projectId: oldProjectId }
          });

          // Excluir o projeto antigo
          await tx.project.delete({
            where: { id: oldProjectId }
          });

          
        }

        return updatedInvoice;
      });

      const message = isFirstLinking 
        ? "Invoice linked to project successfully (first time linking - old project deleted)"
        : "Invoice moved to new project successfully (old project preserved)";

      console.log(`[UnifiedInvoiceController] Invoice ${id} linked to project ${projectId} successfully`);

      return res.status(200).json({
        success: true,
        message,
        invoice: result
      });

    } catch (error: any) {
      console.error("[UnifiedInvoiceController] Error linking invoice to project:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to link invoice to project"
      });
    }
  }
} 