import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import { CustomInvoiceController } from "../controllers/invoice/CustomInvoiceController";
import { MobileStandaloneCustomInvoiceController } from "../controllers/invoice/MobileStandaloneCustomInvoiceController";
import { checkToken } from "../middlewares/checkToken";


const customInvoiceRoutes = Router();
const customInvoiceController = new CustomInvoiceController();
const mobileStandaloneCustomInvoiceController = new MobileStandaloneCustomInvoiceController();

// Criar invoice personalizado
customInvoiceRoutes.post("/custom/invoice/mobile/project/:projectId", checkToken, access('Invoice', [ref('project', 'params.projectId'), ref('pdf', 'body.idPdfProject', true)]), mobileStandaloneCustomInvoiceController.handleProject.bind(mobileStandaloneCustomInvoiceController));
customInvoiceRoutes.put("/custom/invoice/mobile/project/:invoiceId", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), mobileStandaloneCustomInvoiceController.updateProject.bind(mobileStandaloneCustomInvoiceController));
customInvoiceRoutes.post("/custom/invoice/mobile/standalone", checkToken, access('Invoice', [ref('company', 'body.companyId'), ref('pdf', 'body.idPdfProject', true)]), mobileStandaloneCustomInvoiceController.handle.bind(mobileStandaloneCustomInvoiceController));
customInvoiceRoutes.get("/custom/invoice/mobile/:invoiceId", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), mobileStandaloneCustomInvoiceController.getForEdit.bind(mobileStandaloneCustomInvoiceController));
customInvoiceRoutes.put("/custom/invoice/mobile/:invoiceId", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), mobileStandaloneCustomInvoiceController.update.bind(mobileStandaloneCustomInvoiceController));
customInvoiceRoutes.post("/custom/invoice/:projectId", checkToken, access('Invoice', [ref('project', 'params.projectId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.createInvoice.bind(customInvoiceController));
customInvoiceRoutes.get("/custom/invoice/:projectId/generate-number", checkToken, access('Invoice', [ref('project', 'params.projectId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.generateNumber.bind(customInvoiceController));
customInvoiceRoutes.get("/custom/invoice/global/:companyId/generate-number", checkToken, access('Invoice', [ref('company', 'params.companyId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.generateGlobalNumber.bind(customInvoiceController));

// Buscar invoices por projeto
customInvoiceRoutes.get("/custom/invoices/:projectId", checkToken, access('Invoice', [ref('project', 'params.projectId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.getInvoicesByProject.bind(customInvoiceController));

// Enviar invoice
customInvoiceRoutes.post("/custom/invoice/:invoiceId/send", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.sendInvoice.bind(customInvoiceController));

// Cancelar invoice
customInvoiceRoutes.post("/custom/invoice/:invoiceId/cancel", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.cancelInvoice.bind(customInvoiceController));

// Adicionar esta nova rota
customInvoiceRoutes.get("/custom/invoice/:invoiceId/pdf", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.generateInvoicePdf.bind(customInvoiceController));

// Adicionar esta nova rota para enviar invoice para múltiplos destinatários
customInvoiceRoutes.post(
  "/custom/invoice/:invoiceId/send-multiple",
  checkToken,
  access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]),
  customInvoiceController.sendInvoiceMultiple.bind(customInvoiceController)
);

// Enviar confirmação de pagamento
customInvoiceRoutes.post("/invoice/send/paid", checkToken, access('Invoice', [ref('invoice', 'body.invoiceId'), ref('pdf', 'body.pdfInvoicePaidId', true)]), customInvoiceController.sendInvoicePaid.bind(customInvoiceController));

// Atualizar invoice personalizado
customInvoiceRoutes.put("/custom/invoice/:invoiceId", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId'), ref('pdf', 'body.idPdfProject', true)]), customInvoiceController.updateInvoice.bind(customInvoiceController));

customInvoiceRoutes.get("/custom/invoice/view/:invoiceId",  customInvoiceController.statusViewInvoice.bind(customInvoiceController));

// Rotas públicas para Custom Invoice (similar ao Payment Element)
// Buscar invoice custom para visualização pública
customInvoiceRoutes.get("/custom/invoices/public/:invoiceId", customInvoiceController.getCustomInvoicePublic.bind(customInvoiceController));

// Buscar PDF de uma invoice custom
customInvoiceRoutes.get("/custom/invoices/public/:invoiceId/pdf", customInvoiceController.getCustomInvoicePdf.bind(customInvoiceController));


export { customInvoiceRoutes }; 
