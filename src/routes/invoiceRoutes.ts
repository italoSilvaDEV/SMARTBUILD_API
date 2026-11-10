import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import { UnifiedInvoiceController } from "../controllers/invoice/UnifiedInvoiceController";
import { checkToken } from "../middlewares/checkToken";
import { CustomInvoiceController } from "../controllers/invoice/CustomInvoiceController";
import { updatePdfInvoiceController } from "../controllers/invoice/updatePdfController";
import { InvoiceItemsController } from "../controllers/invoice/InvoiceItemsController";

const invoiceRoutes = Router();
const unifiedInvoiceController = new UnifiedInvoiceController();
const customInvoiceController = new CustomInvoiceController();
const updatePdfController = new updatePdfInvoiceController();
const invoiceItemsController = new InvoiceItemsController();

// Criar invoice (tipo definido no body)
invoiceRoutes.post("/invoice/:projectId", checkToken, access('Invoice', [ref('project', 'params.projectId'), ref('estimate', 'body.estimateId', true), ref('pdf', 'body.idPdfProject', true)]), unifiedInvoiceController.createInvoice.bind(unifiedInvoiceController));

// Buscar invoice específico por ID
invoiceRoutes.get("/invoice/:id", checkToken, access(['Invoice', 'Projects'], [ref('invoice', 'params.id')]), unifiedInvoiceController.getInvoiceById.bind(unifiedInvoiceController));

// Vincular invoice a um projeto (standalone invoices)
invoiceRoutes.patch("/invoice/link-to-project/:id", checkToken, access('Invoice', [ref('invoice', 'params.id'), ref('project', 'body.projectId')]), unifiedInvoiceController.linkInvoiceToProject.bind(unifiedInvoiceController));

// Buscar invoices por projeto
invoiceRoutes.get("/invoice/project/:projectId", checkToken, access('Invoice', [ref('project', 'params.projectId')]), unifiedInvoiceController.getInvoicesByProject.bind(unifiedInvoiceController));

// Buscar invoices por empresa
invoiceRoutes.get("/invoice/company/:companyId", checkToken, access('Invoice', [ref('company', 'params.companyId')]), unifiedInvoiceController.getInvoicesByCompany.bind(unifiedInvoiceController));

// Enviar invoice
invoiceRoutes.post("/invoice/:invoiceId/send", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), unifiedInvoiceController.sendInvoice.bind(unifiedInvoiceController));

// Cancelar invoice
invoiceRoutes.post("/invoice/:invoiceId/cancel", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId')]), unifiedInvoiceController.cancelInvoice.bind(unifiedInvoiceController));

// Deletar invoice
invoiceRoutes.delete("/invoice/delete/:id", checkToken, access('Invoice', [ref('invoice', 'params.id')]), customInvoiceController.deleteInvoice.bind(customInvoiceController));

// Atualizar PDF Invoice
invoiceRoutes.put("/invoice/update-pdf", checkToken, updatePdfController.handle.bind(updatePdfController));

invoiceRoutes.post("/invoice/create/item", checkToken, access('Invoice', [ref('invoice', 'body.invoiceId')]), invoiceItemsController.createInvoiceItem.bind(invoiceItemsController));
invoiceRoutes.put("/invoice/update/item", checkToken, access('Invoice', [ref('invoiceItem', 'body.invoiceItemId')]), invoiceItemsController.updateInvoiceItem.bind(invoiceItemsController));
invoiceRoutes.delete("/invoice/delete/item/:invoiceItemId", checkToken, access('Invoice', [ref('invoiceItem', 'params.invoiceItemId')]), invoiceItemsController.deleteInvoiceItem.bind(invoiceItemsController));

// Buscar pagamentos QBO de um invoice
invoiceRoutes.get("/invoices/:invoiceId/qbo-payments", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId')]), unifiedInvoiceController.getQboPayments.bind(unifiedInvoiceController));

export { invoiceRoutes }; 