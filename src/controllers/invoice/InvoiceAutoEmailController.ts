import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

/**
 * Controller responsável por gerenciar as configurações de envio automático de emails para invoices
 * Este controller permite ativar/desativar e configurar quando os lembretes devem ser enviados
 */
export class InvoiceAutoEmailController {
  /**
   * Buscar as configurações de envio automático de emails de uma empresa
   * GET /invoice/auto-email/config/:companyId
   */
  async getConfig(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      // Buscar configuração existente
      let config = await prisma.invoiceAutoEmailConfig.findUnique({
        where: { companyId }
      });

      // Se não existir, criar uma configuração padrão desativada
      if (!config) {
        config = await prisma.invoiceAutoEmailConfig.create({
          data: {
            companyId,
            isActive: false,
            sendBefore7Days: false,
            sendBefore3Days: false,
            sendBefore1Day: false,
            sendOnDueDate: false,
            sendAfter1Day: false,
            sendAfter3Days: false,
            sendAfter7Days: false
          }
        });
      }

      return res.status(200).json(config);
    } catch (error) {
      // console.error("Error fetching auto email config:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  /**
   * Atualizar as configurações de envio automático de emails
   * PUT /invoice/auto-email/config/:companyId
   */
  async updateConfig(req: Request, res: Response) {
    const { companyId } = req.params;
    const {
      isActive,
      sendBefore7Days,
      sendBefore3Days,
      sendBefore1Day,
      sendOnDueDate,
      sendAfter1Day,
      sendAfter3Days,
      sendAfter7Days
    } = req.body;

    try {
      // Verificar se a empresa existe
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      // Atualizar ou criar configuração
      const config = await prisma.invoiceAutoEmailConfig.upsert({
        where: { companyId },
        update: {
          isActive,
          sendBefore7Days,
          sendBefore3Days,
          sendBefore1Day,
          sendOnDueDate,
          sendAfter1Day,
          sendAfter3Days,
          sendAfter7Days
        },
        create: {
          companyId,
          isActive,
          sendBefore7Days,
          sendBefore3Days,
          sendBefore1Day,
          sendOnDueDate,
          sendAfter1Day,
          sendAfter3Days,
          sendAfter7Days
        }
      });

      return res.status(200).json({
        message: "Auto email configuration updated successfully",
        config
      });
    } catch (error) {
      // console.error("Error updating auto email config:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  /**
   * Buscar histórico de envios automáticos de um invoice específico
   * GET /invoice/auto-email/logs/:invoiceId
   */
  async getInvoiceLogs(req: Request, res: Response) {
    const { invoiceId } = req.params;

    try {
      const logs = await prisma.invoiceAutoEmailLog.findMany({
        where: { invoiceId },
        orderBy: { sentAt: "desc" }
      });

      return res.status(200).json({ logs });
    } catch (error) {
      // console.error("Error fetching invoice auto email logs:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  /**
   * Buscar todos os logs de envio automático de uma empresa
   * GET /invoice/auto-email/logs/company/:companyId
   */
  async getCompanyLogs(req: Request, res: Response) {
    const { companyId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    try {
      const pageNumber = Number(page);
      const limitNumber = Number(limit);
      const skip = (pageNumber - 1) * limitNumber;

      // Buscar logs com informações do invoice
      const logs = await prisma.invoiceAutoEmailLog.findMany({
        where: {
          invoice: {
            companyId
          }
        },
        include: {
          invoice: {
            select: {
              externalInvoiceId: true,
              totalAmount: true,
              dueDate: true,
              project: {
                select: {
                  client: {
                    select: {
                      name: true,
                      email: true
                    }
                  }
                }
              }
            }
          }
        },
        orderBy: { sentAt: "desc" },
        skip,
        take: limitNumber
      });

      // Contar total de logs
      const total = await prisma.invoiceAutoEmailLog.count({
        where: {
          invoice: {
            companyId
          }
        }
      });

      return res.status(200).json({
        logs,
        pagination: {
          total,
          page: pageNumber,
          limit: limitNumber,
          totalPages: Math.ceil(total / limitNumber)
        }
      });
    } catch (error) {
      // console.error("Error fetching company auto email logs:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  /**
   * Obter estatísticas de envios automáticos de uma empresa
   * GET /invoice/auto-email/stats/:companyId
   */
  async getStats(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      // Total de envios
      const totalSent = await prisma.invoiceAutoEmailLog.count({
        where: {
          invoice: { companyId },
          status: "success"
        }
      });

      // Total de erros
      const totalErrors = await prisma.invoiceAutoEmailLog.count({
        where: {
          invoice: { companyId },
          status: "error"
        }
      });

      // Envios por tipo
      const sentByType = await prisma.invoiceAutoEmailLog.groupBy({
        by: ["emailType"],
        where: {
          invoice: { companyId },
          status: "success"
        },
        _count: {
          id: true
        }
      });

      // Formatar resultados por tipo
      const typeStats = {
        before_7: 0,
        before_3: 0,
        before_1: 0,
        on_due: 0,
        after_1: 0,
        after_3: 0,
        after_7: 0
      };

      sentByType.forEach(item => {
        if (item.emailType in typeStats) {
          typeStats[item.emailType as keyof typeof typeStats] = item._count.id;
        }
      });

      return res.status(200).json({
        totalSent,
        totalErrors,
        successRate: totalSent + totalErrors > 0 
          ? ((totalSent / (totalSent + totalErrors)) * 100).toFixed(2) 
          : 0,
        sentByType: typeStats
      });
    } catch (error) {
      // console.error("Error fetching auto email stats:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
}

