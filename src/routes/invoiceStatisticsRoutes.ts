import { Router } from "express";
import { InvoiceStatisticsController } from "../controllers/invoice/InvoiceStatisticsController";
import { checkToken } from "../middlewares/checkToken";

const invoiceStatisticsRoutes = Router();
const invoiceStatisticsController = new InvoiceStatisticsController();

// Rota para obter estatísticas de faturas por empresa
invoiceStatisticsRoutes.get(
  "/companies/:companyId/invoice-statistics", 
  checkToken, 
  invoiceStatisticsController.getInvoiceStatistics
);

export { invoiceStatisticsRoutes }; 