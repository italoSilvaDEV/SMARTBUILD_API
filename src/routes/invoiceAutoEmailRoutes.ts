import { Router } from "express";
import { InvoiceAutoEmailController } from "../controllers/invoice/InvoiceAutoEmailController";
import { checkToken } from "../middlewares/checkToken";

const invoiceAutoEmailRoutes = Router();
const invoiceAutoEmailController = new InvoiceAutoEmailController();

// Buscar configurações de envio automático de uma empresa
invoiceAutoEmailRoutes.get(
  "/invoice/auto-email/config/:companyId",
  checkToken,
  invoiceAutoEmailController.getConfig.bind(invoiceAutoEmailController)
);

// Atualizar configurações de envio automático
invoiceAutoEmailRoutes.put(
  "/invoice/auto-email/config/:companyId",
  checkToken,
  invoiceAutoEmailController.updateConfig.bind(invoiceAutoEmailController)
);

// Buscar logs de envio automático de um invoice específico
invoiceAutoEmailRoutes.get(
  "/invoice/auto-email/logs/:invoiceId",
  checkToken,
  invoiceAutoEmailController.getInvoiceLogs.bind(invoiceAutoEmailController)
);

// Buscar logs de envio automático de uma empresa (com paginação)
invoiceAutoEmailRoutes.get(
  "/invoice/auto-email/logs/company/:companyId",
  checkToken,
  invoiceAutoEmailController.getCompanyLogs.bind(invoiceAutoEmailController)
);

// Buscar estatísticas de envios automáticos
invoiceAutoEmailRoutes.get(
  "/invoice/auto-email/stats/:companyId",
  checkToken,
  invoiceAutoEmailController.getStats.bind(invoiceAutoEmailController)
);

export { invoiceAutoEmailRoutes };

