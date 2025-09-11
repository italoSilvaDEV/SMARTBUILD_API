import { Router } from "express";
import { UnifiedInvoiceController } from "../controllers/invoice/UnifiedInvoiceController";
import { checkToken } from "../middlewares/checkToken";
import { CustomInvoiceController } from "../controllers/invoice/CustomInvoiceController";
import { updatePdfInvoiceController } from "../controllers/invoice/updatePdfController";
import { UpdateInvoiceController } from "../controllers/invoice/updateInvoice";

const invoiceRoutes = Router();
const unifiedInvoiceController = new UnifiedInvoiceController();
const customInvoiceController = new CustomInvoiceController();
const updatePdfController = new updatePdfInvoiceController();
const updateInvoiceController = new UpdateInvoiceController();

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

// Deletar invoice
invoiceRoutes.delete("/invoice/delete/:id", checkToken, customInvoiceController.deleteInvoice.bind(customInvoiceController));

// Atualizar PDF Invoice
invoiceRoutes.put("/invoice/update-pdf", checkToken, updatePdfController.handle.bind(updatePdfController));

// Atualizar total amount Invoice
invoiceRoutes.put("/invoice/update-total-amount", checkToken, updateInvoiceController.updateTotalAmount.bind(updateInvoiceController));

export { invoiceRoutes }; 