import { Router } from "express";
import { StripeController } from "../controllers/stripe/StripeController";
import { checkToken } from "../middlewares/checkToken";

const stripeRoutes = Router();
const stripeController = new StripeController();

// Conectar Company ao Stripe
stripeRoutes.get("/stripe/connect/:companyId",checkToken,  stripeController.connectCompany);

// Verificar Status da conexão com Stripe
stripeRoutes.get("/stripe/status/:companyId", checkToken, stripeController.checkStripeStatus);

stripeRoutes.post("/stripe/invoice/:projectId", checkToken, stripeController.createInvoice);
stripeRoutes.post("/stripe/invoice/:invoiceId/send", checkToken, stripeController.sendInvoice);
stripeRoutes.post("/stripe/invoice/:invoiceId/cancel", checkToken, stripeController.cancelInvoice);

// Buscar Invoices relacionadas a um ProjectId
stripeRoutes.get("/stripe/invoices/:projectId", checkToken, stripeController.getInvoicesByProject);

stripeRoutes.get("/stripe/company-invoices/:companyId", checkToken, stripeController.getInvoicesByCompany);

// Atualizar invoice Stripe
stripeRoutes.put("/stripe/invoice/:invoiceId", checkToken, stripeController.updateInvoice);

// Criar sessão de checkout para compra de plano (rota pública)
stripeRoutes.post("/stripe/checkout-plan", stripeController.createCheckoutSession);

export { stripeRoutes };