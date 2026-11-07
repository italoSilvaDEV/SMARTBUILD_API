import { requireCompanyResourceAccess as access, ref } from '../middlewares/companyResourceAccess';
import { Router } from "express";
import { CustomInvoicePaymentController } from "../controllers/invoice/CustomInvoicePaymentController";
import { checkToken } from "../middlewares/checkToken";

const invoicePaymentRoutes = Router();
const customInvoicePaymentController = new CustomInvoicePaymentController();

// Rota para registrar um pagamento para uma fatura customizada
invoicePaymentRoutes.post("/invoices/:invoiceId/payment",checkToken, access('Invoice', [ref('invoice', 'params.invoiceId')]),customInvoicePaymentController.createPayment);

// Rota para obter informações de pagamento de uma fatura
invoicePaymentRoutes.get("/invoices/:invoiceId/payment", checkToken, access('Invoice', [ref('invoice', 'params.invoiceId')]),customInvoicePaymentController.getPayment);

// Rota para atualizar informações de pagamento
invoicePaymentRoutes.put("/invoices/:invoiceId/payment",checkToken, access('Invoice', [ref('invoice', 'params.invoiceId')]),customInvoicePaymentController.updatePayment);

export { invoicePaymentRoutes }; 