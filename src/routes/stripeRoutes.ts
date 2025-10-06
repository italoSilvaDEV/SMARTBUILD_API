import { Router } from "express";
import { StripeController } from "../controllers/stripe/StripeController";
import { checkToken } from "../middlewares/checkToken";

const stripeRoutes = Router();
const stripeController = new StripeController();

// Conectar Company ao Stripe
stripeRoutes.get("/stripe/connect/:companyId", checkToken, stripeController.connectCompany.bind(stripeController));

// Verificar Status da conexão com Stripe
stripeRoutes.get("/stripe/status/:companyId", checkToken, stripeController.checkStripeStatus.bind(stripeController));

stripeRoutes.post("/stripe/invoice/:projectId", checkToken, stripeController.createInvoice.bind(stripeController));
stripeRoutes.post("/stripe/invoice/:invoiceId/send", checkToken, stripeController.sendInvoice.bind(stripeController));
stripeRoutes.post("/stripe/invoice/:invoiceId/cancel", checkToken, stripeController.cancelInvoice.bind(stripeController));

// Buscar Invoices relacionadas a um ProjectId
stripeRoutes.get("/stripe/invoices/:projectId", checkToken, stripeController.getInvoicesByProject.bind(stripeController));

stripeRoutes.get("/stripe/company-invoices/:companyId", checkToken, stripeController.getInvoicesByCompany.bind(stripeController));

// Atualizar invoice Stripe
stripeRoutes.put("/stripe/invoice/:invoiceId", checkToken, stripeController.updateInvoice.bind(stripeController));

// Criar sessão de checkout para compra de plano (rota pública)
stripeRoutes.post("/stripe/checkout-plan", stripeController.createCheckoutSession.bind(stripeController));

// Nova rota para o portal do cliente
stripeRoutes.post("/stripe/company/:companyId/customer-portal", checkToken, stripeController.createCustomerPortalSession.bind(stripeController));

export { stripeRoutes };