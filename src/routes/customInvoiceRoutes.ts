import { Router } from "express";
import { CustomInvoiceController } from "../controllers/invoice/CustomInvoiceController";
import { checkToken } from "../middlewares/checkToken";

const customInvoiceRoutes = Router();
const customInvoiceController = new CustomInvoiceController();

// Criar invoice personalizado
customInvoiceRoutes.post("/custom/invoice/:projectId", checkToken, customInvoiceController.createInvoice);

// Buscar invoices por projeto
customInvoiceRoutes.get("/custom/invoices/:projectId", checkToken, customInvoiceController.getInvoicesByProject);

// Enviar invoice
customInvoiceRoutes.post("/custom/invoice/:invoiceId/send", checkToken, customInvoiceController.sendInvoice);

// Cancelar invoice
customInvoiceRoutes.post("/custom/invoice/:invoiceId/cancel", checkToken, customInvoiceController.cancelInvoice);

// Adicionar esta nova rota
customInvoiceRoutes.get("/custom/invoice/:invoiceId/pdf", checkToken, customInvoiceController.generateInvoicePdf);

export { customInvoiceRoutes }; 