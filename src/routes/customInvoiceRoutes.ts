import { Router } from "express";
import { CustomInvoiceController } from "../controllers/invoice/CustomInvoiceController";
import { checkToken } from "../middlewares/checkToken";

const customInvoiceRoutes = Router();
const customInvoiceController = new CustomInvoiceController();
const mobileStandaloneCustomInvoiceController = new MobileStandaloneCustomInvoiceController();

// Criar invoice personalizado
customInvoiceRoutes.post("/custom/invoice/mobile/standalone", checkToken, mobileStandaloneCustomInvoiceController.handle.bind(mobileStandaloneCustomInvoiceController));
customInvoiceRoutes.post("/custom/invoice/:projectId", checkToken, customInvoiceController.createInvoice.bind(customInvoiceController)); 
customInvoiceRoutes.get("/custom/invoice/:projectId/generate-number", checkToken, customInvoiceController.generateNumber.bind(customInvoiceController));
customInvoiceRoutes.get("/custom/invoice/global/:companyId/generate-number", checkToken, customInvoiceController.generateGlobalNumber.bind(customInvoiceController));

// Buscar invoices por projeto
customInvoiceRoutes.get("/custom/invoices/:projectId", checkToken, customInvoiceController.getInvoicesByProject.bind(customInvoiceController));

// Enviar invoice
customInvoiceRoutes.post("/custom/invoice/:invoiceId/send", checkToken, customInvoiceController.sendInvoice.bind(customInvoiceController));

// Cancelar invoice
customInvoiceRoutes.post("/custom/invoice/:invoiceId/cancel", checkToken, customInvoiceController.cancelInvoice.bind(customInvoiceController));

// Adicionar esta nova rota
customInvoiceRoutes.get("/custom/invoice/:invoiceId/pdf", checkToken, customInvoiceController.generateInvoicePdf.bind(customInvoiceController));

// Adicionar esta nova rota para enviar invoice para múltiplos destinatários
customInvoiceRoutes.post(
  "/custom/invoice/:invoiceId/send-multiple",
  checkToken,
  customInvoiceController.sendInvoiceMultiple.bind(customInvoiceController)
);

// Enviar confirmação de pagamento
customInvoiceRoutes.post("/invoice/send/paid", checkToken, customInvoiceController.sendInvoicePaid.bind(customInvoiceController));

// Atualizar invoice personalizado
customInvoiceRoutes.put("/custom/invoice/:invoiceId", checkToken, customInvoiceController.updateInvoice.bind(customInvoiceController));

customInvoiceRoutes.get("/custom/invoice/view/:invoiceId",  customInvoiceController.statusViewInvoice.bind(customInvoiceController));

// Rotas públicas para Custom Invoice (similar ao Payment Element)
// Buscar invoice custom para visualização pública
customInvoiceRoutes.get("/custom/invoices/public/:invoiceId", customInvoiceController.getCustomInvoicePublic.bind(customInvoiceController));

// Buscar PDF de uma invoice custom
customInvoiceRoutes.get("/custom/invoices/public/:invoiceId/pdf", customInvoiceController.getCustomInvoicePdf.bind(customInvoiceController));


export { customInvoiceRoutes }; 