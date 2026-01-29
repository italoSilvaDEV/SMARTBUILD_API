import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import dayjs from "dayjs";

function getDateRange(periodType: string) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date | undefined;

    switch (periodType) {
        case "thisYear":
            startDate = new Date(now.getFullYear(), 0, 1);
            break;

        case "thisQuarter":
            const currentQuarter = Math.floor(now.getMonth() / 3);
            startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
            break;

        case "last3Months":
            startDate = new Date();
            startDate.setMonth(now.getMonth() - 3);
            break;

        case "lastMonth":
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            break;

        case "thisMonth":
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;

        case "last30Days":
            startDate = new Date();
            startDate.setDate(now.getDate() - 30);
            break;

        case "allPeriod":
            startDate = new Date(2020, 0, 1);
            break;

        default:
            startDate = new Date(now.getFullYear(), 0, 1);
    }

    return { startDate, endDate };
}

export class InvoiceStatisticsController {
  async getInvoiceStatistics(req: Request, res: Response) {
    const { companyId } = req.params;

    try {
      const { period = "thisYear", startDate: queryStartDate, endDate: queryEndDate } = req.query;

      const validPeriods = [
        "thisYear",
        "thisQuarter",
        "last3Months",
        "lastMonth",
        "thisMonth",
        "last30Days",
        "allPeriod"
      ];

      let startDate: Date;
      let endDate: Date | undefined;
      let isCustomRange = false;

      if (queryStartDate && queryEndDate) {
        startDate = dayjs(queryStartDate as string).startOf('day').toDate();
        endDate = dayjs(queryEndDate as string).endOf('day').toDate();
        isCustomRange = true;
      } else {
        if (!validPeriods.includes(period as string)) {
          return res.status(400).json({
            error: `Invalid period. Valid values are: ${validPeriods.join(", ")}`
          });
        }
        const range = getDateRange(period as string);
        startDate = range.startDate;
        endDate = range.endDate;
      }

      const dateFilter: any = {};
      if (isCustomRange) {
        dateFilter.gte = startDate;
        dateFilter.lte = endDate;
      } else if (period !== "allPeriod") {
        dateFilter.gte = startDate;
        if (endDate) {
          dateFilter.lte = endDate;
        }
      }

      // Definição dos intervalos para comparação (Diferença %)
      let currentPeriodStart: Date;
      let currentPeriodEnd: Date;
      let previousPeriodStart: Date;
      let previousPeriodEnd: Date;

      if (isCustomRange) {
        // Se for customizado, compara com o período anterior de mesma duração
        currentPeriodStart = startDate;
        currentPeriodEnd = endDate!;
        const durationInMs = dayjs(currentPeriodEnd).diff(dayjs(currentPeriodStart));
        previousPeriodStart = dayjs(currentPeriodStart).subtract(durationInMs + 1, 'ms').toDate();
        previousPeriodEnd = dayjs(currentPeriodStart).subtract(1, 'ms').toDate();
      } else {
        // Lógica padrão de mês atual vs mês anterior
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        
        const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        
        currentPeriodStart = new Date(currentYear, currentMonth, 1);
        currentPeriodEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
        
        previousPeriodStart = new Date(lastMonthYear, lastMonth, 1);
        previousPeriodEnd = new Date(lastMonthYear, lastMonth + 1, 0, 23, 59, 59);
      }

      const allInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { notIn: ['void'] },
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ],
          ...(Object.keys(dateFilter).length > 0 && {
            createdAt: dateFilter
          })
        }
      });

      // Consulta para faturas do período atual (para comparação)
      const currentPeriodInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { notIn: ['void'] },
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ],
          createdAt: {
            gte: currentPeriodStart,
            lte: currentPeriodEnd
          }
        }
      });

      // Consulta para faturas do período anterior (para comparação)
      const lastPeriodInvoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: { notIn: ['void'] },
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ],
          createdAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd
          }
        }
      });

      // Calcular totais das faturas filtradas (dateFilter)
      const totalInvoices = allInvoices.reduce((sum, invoice) => 
        sum + Number(invoice.totalAmount), 0);
      
      const totalInvoicePaid = allInvoices
        .filter(invoice => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      
      const totalInvoicePending = allInvoices
        .filter(invoice => ['open', 'draft'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

      // Calcular totais do período atual para comparação
      const currentPeriodTotalInvoices = currentPeriodInvoices.reduce((sum, invoice) => 
        sum + Number(invoice.totalAmount), 0);
      
      const currentPeriodTotalInvoicePaid = currentPeriodInvoices
        .filter(invoice => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      
      const currentPeriodTotalInvoicePending = currentPeriodInvoices
        .filter(invoice => ['open', 'draft'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

      // Calcular totais do período anterior
      const lastPeriodTotalInvoices = lastPeriodInvoices.reduce((sum, invoice) => 
        sum + Number(invoice.totalAmount), 0);
      
      const lastPeriodTotalInvoicePaid = lastPeriodInvoices
        .filter(invoice => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
      
      const lastPeriodTotalInvoicePending = lastPeriodInvoices
        .filter(invoice => ['open', 'draft'].includes(invoice.status))
        .reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);

      // Calcular diferenças percentuais
      const calculatePercentageDifference = (current: number, previous: number): number => {
        if (previous === 0) {
          return current > 0 ? 100 : 0;
        }
        return Math.round(((current - previous) / previous) * 100);
      };

      // Calcular diferenças usando os totais do período atual e anterior
      const differenceLastMonthTotalInvoice = calculatePercentageDifference(
        currentPeriodTotalInvoices, lastPeriodTotalInvoices
      );
      
      const differencePaidLastMonthTotalInvoice = calculatePercentageDifference(
        currentPeriodTotalInvoicePaid, lastPeriodTotalInvoicePaid
      );
      
      const differencePendingLastMonthTotalInvoice = calculatePercentageDifference(
        currentPeriodTotalInvoicePending, lastPeriodTotalInvoicePending
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
            ],
            ...(Object.keys(dateFilter).length > 0 && {
              createdAt: dateFilter
            })
          }
        }),
        pending: await prisma.invoice.count({
          where: {
            companyId,
            status: { in: ['open', 'draft'] },
            OR: [
              { cancel_invoice_edit: false },
              { cancel_invoice_edit: null }
            ],
            ...(Object.keys(dateFilter).length > 0 && {
              createdAt: dateFilter
            })
          }
        }),
        canceled: await prisma.invoice.count({
          where: {
            companyId,
            status: 'void',
            OR: [
              { cancel_invoice_edit: false },
              { cancel_invoice_edit: null }
            ],
            ...(Object.keys(dateFilter).length > 0 && {
              createdAt: dateFilter
            })
          }
        })
      };

      // Dados para receita mensal (para o front-end criar o gráfico de barras)
      const invoices = await prisma.invoice.findMany({
        where: {
          companyId,
          status: 'paid',
          OR: [
            { cancel_invoice_edit: false },
            { cancel_invoice_edit: null }
          ],
          ...(Object.keys(dateFilter).length > 0 && {
            createdAt: dateFilter
          })
        },
        select: {
          totalAmount: true,
          createdAt: true
        }
      });

      const revenueByMonth = invoices.reduce<Record<string, number>>((acc, invoice) => {
        const monthYear = dayjs(invoice.createdAt).format('MMM YYYY');
        acc[monthYear] = (acc[monthYear] || 0) + Number(invoice.totalAmount || 0);
        return acc;
      }, {});

      const monthlyRevenueData = Object.entries(revenueByMonth)
        .sort((a, b) => dayjs(a[0], 'MMM YYYY').valueOf() - dayjs(b[0], 'MMM YYYY').valueOf())
        .map(([month, revenue]) => ({
          month,
          revenue: Number(revenue.toFixed(2))
        }));




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
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 