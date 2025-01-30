import { Router } from "express";
import { StripeController } from "../controllers/stripe/StripeController";
import { checkToken } from "../middlewares/checkToken";

const stripeRoutes = Router();
const stripeController = new StripeController();

// Conectar Company ao Stripe
stripeRoutes.get("/stripe/connect/:companyId",checkToken,  stripeController.connectCompany);

// Verificar Status da conexão com Stripe
stripeRoutes.get("/stripe/status/:companyId", checkToken, stripeController.checkStripeStatus);

export { stripeRoutes };