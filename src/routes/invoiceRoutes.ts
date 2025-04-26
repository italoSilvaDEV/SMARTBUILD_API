import { Router } from "express";
import { UnifiedInvoiceController } from "../controllers/invoice/UnifiedInvoiceController";
import { checkToken } from "../middlewares/checkToken";

const invoiceRoutes = Router();
const unifiedInvoiceController = new UnifiedInvoiceController();

// Criar invoice (tipo definido no body)
invoiceRoutes.post("/invoice/:projectId", checkToken, unifiedInvoiceController.createInvoice.bind(unifiedInvoiceController));

// Buscar invoices por projeto
invoiceRoutes.get("/invoice/project/:projectId", checkToken, unifiedInvoiceController.getInvoicesByProject.bind(unifiedInvoiceController));

// Buscar invoices por empresa
invoiceRoutes.get("/invoice/company/:companyId", checkToken, unifiedInvoiceController.getInvoicesByCompany.bind(unifiedInvoiceController));

// Enviar invoice
invoiceRoutes.post("/invoice/:invoiceId/send", checkToken, unifiedInvoiceController.sendInvoice.bind(unifiedInvoiceController));

// Cancelar invoice
invoiceRoutes.post("/invoice/:invoiceId/cancel", checkToken, unifiedInvoiceController.cancelInvoice.bind(unifiedInvoiceController));

export { invoiceRoutes }; 