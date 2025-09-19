import { Router } from "express";
import { PaymentElementController } from "../controllers/stripe/PaymentElementController";
import { checkToken } from "../middlewares/checkToken";

const paymentElementRoutes = Router();
const paymentElementController = new PaymentElementController();

// Iniciar processo de pagamento via Payment Element
paymentElementRoutes.post("/stripe/payments/start/:invoiceId", paymentElementController.startPayment);

// Recalcular valor baseado no método de pagamento
paymentElementRoutes.post("/stripe/payments/recalculate", paymentElementController.recalculatePayment);

// Obter status do PaymentIntent
paymentElementRoutes.get("/stripe/payments/status/:paymentIntentId", paymentElementController.getPaymentStatus); 

// Listar PaymentIntents de uma invoice
paymentElementRoutes.get("/stripe/payments/invoice/:invoiceId", checkToken, paymentElementController.getInvoicePaymentIntents);

// Buscar PDF de uma invoice
paymentElementRoutes.get("/stripe/payments/invoice/:invoiceId/pdf", paymentElementController.getInvoicePdf);

export { paymentElementRoutes };
