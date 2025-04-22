import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class InvoiceStatisticsController {
  async getInvoiceStatistics(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      // Obter data atual e data do mês anterior
      const currentDate = new Date();
      const currentMonth = currentDate.getMonth();
      const currentYear = currentDate.getFullYear();
      
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      
      // Início e fim do mês atual
      const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
      const endOfCurrentMonth = new Date(currentYear, currentMonth + 1, 0);
      
      // Início e fim do mês anterior
      const startOfLastMonth = new Date(lastMonthYear, lastMonth, 1);
      const endOfLastMonth = new Date(lastMonthYear, lastMonth + 1, 0);

      // Consulta para todas as faturas (não canceladas)
      const allInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { notIn: ['void'] },
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ]
        }
      });

      // Consulta para faturas do mês atual (não canceladas)
      const currentMonthInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { notIn: ['void'] },
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ],
          createdAt: {
            gte: startOfCurrentMonth,
            lte: endOfCurrentMonth
          }
        }
      });

      // Consulta para faturas do mês anterior (não canceladas)
      const lastMonthInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { notIn: ['void'] },
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ],
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth
          }
        }
      });

      // Calcular totais de todas as faturas
      const totalInvoices = allInvoices.reduce((sum, invoice) => 
        sum + Number(invoice.totalAmount), 0);
      
      const totalInvoicePaid = allInvoices
        .filter(invoice => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      
      const totalInvoicePending = allInvoices
        .filter(invoice => ['open', 'draft'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

      // Calcular totais do mês atual para comparação
      const currentMonthTotalInvoices = currentMonthInvoices.reduce((sum, invoice) => 
        sum + Number(invoice.totalAmount), 0);
      
      const currentMonthTotalInvoicePaid = currentMonthInvoices
        .filter(invoice => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      
      const currentMonthTotalInvoicePending = currentMonthInvoices
        .filter(invoice => ['open', 'draft'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

      // Calcular totais do mês anterior
      const lastMonthTotalInvoices = lastMonthInvoices.reduce((sum, invoice) => 
        sum + Number(invoice.totalAmount), 0);
      
      const lastMonthTotalInvoicePaid = lastMonthInvoices
        .filter(invoice => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      
      const lastMonthTotalInvoicePending = lastMonthInvoices
        .filter(invoice => ['open', 'draft'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

      // Calcular diferenças percentuais
      const calculatePercentageDifference = (current: number, previous: number): number => {
        if (previous === 0) {
          return current > 0 ? 100 : 0; // Se não havia nada antes e agora tem, crescimento de 100%
        }
        if (current === 0 && previous > 0) {
          return -100; // Se havia algo antes e agora não tem nada, queda de 100%
        }
        // Fórmula: (atual - anterior) / anterior * 100
        return Math.round(((current - previous) / previous) * 100);
      };

      // Calcular diferenças usando os totais do mês atual e anterior
      const differenceLastMonthTotalInvoice = calculatePercentageDifference(
        currentMonthTotalInvoices, lastMonthTotalInvoices
      );
      
      const differencePaidLastMonthTotalInvoice = calculatePercentageDifference(
        currentMonthTotalInvoicePaid, lastMonthTotalInvoicePaid
      );
      
      const differencePendingLastMonthTotalInvoice = calculatePercentageDifference(
        currentMonthTotalInvoicePending, lastMonthTotalInvoicePending
      );

      // Calcular média de valor das faturas
      const totalAverageInvoice = allInvoices.length > 0 
        ? totalInvoices / allInvoices.length 
        : 0;

      // Dados para estatísticas de status (para o front-end criar o gráfico de pizza)
      const invoiceStatusCounts = {
        paid: await prisma.invoice.count({
          where: {
            companyId,
            status: 'paid',
            OR: [
              { cancel_invoice_edit: false },
              { cancel_invoice_edit: null }
            ]
          }
        }),
        pending: await prisma.invoice.count({
          where: {
            companyId,
            status: { in: ['open', 'draft'] },
            OR: [
              { cancel_invoice_edit: false },
              { cancel_invoice_edit: null }
            ]
          }
        }),
        canceled: await prisma.invoice.count({
          where: {
            companyId,
            status: 'void',
            OR: [
              { cancel_invoice_edit: false },
              { cancel_invoice_edit: null }
            ]
          }
        })
      };

      // Dados para receita mensal (para o front-end criar o gráfico de barras)
      const monthlyRevenueData = [];
      
      // Obter dados apenas para 2025
      for (let month = 0; month < 12; month++) {
        const startOfMonth = new Date(2025, month, 1);
        const endOfMonth = new Date(2025, month + 1, 0);
        
        const monthInvoices = await prisma.invoice.findMany({
          where: {
            companyId,
            status: 'paid',
            OR: [
              { cancel_invoice_edit: false },
              { cancel_invoice_edit: null }
            ],
            createdAt: {
              gte: startOfMonth,
              lte: endOfMonth
            }
          }
        });
        
        const revenue = monthInvoices.reduce((sum, invoice) => 
          sum + Number(invoice.totalAmount), 0);
        
        monthlyRevenueData.push({
          month: month + 1, // 1-12 para janeiro-dezembro
          revenue
        });
      }

      console.log("Mês atual - Total de faturas:", currentMonthTotalInvoices);
      console.log("Mês anterior - Total de faturas:", lastMonthTotalInvoices);
      console.log("Diferença percentual:", differenceLastMonthTotalInvoice);

      console.log("Mês atual - Total pago:", currentMonthTotalInvoicePaid);
      console.log("Mês anterior - Total pago:", lastMonthTotalInvoicePaid);
      console.log("Diferença percentual pago:", differencePaidLastMonthTotalInvoice);

      console.log("Mês atual - Total pendente:", currentMonthTotalInvoicePending);
      console.log("Mês anterior - Total pendente:", lastMonthTotalInvoicePending);
      console.log("Diferença percentual pendente:", differencePendingLastMonthTotalInvoice);

      return res.status(200).json({
        totalInvoices,
        differenceLastMonthTotalInvoice,
        totalInvoicePaid,
        differencePaidLastMonthTotalInvoice,
        totalInvoicePending,
        differencePendingLastMonthTotalInvoice,
        totalAverageInvoice,
        invoiceStatusCounts,
        monthlyRevenueData
      });
    } catch (error: any) {
      console.error("Error fetching invoice statistics:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 