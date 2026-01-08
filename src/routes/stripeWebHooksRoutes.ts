import { Router } from "express";
import { StripeWebHooksController } from "../controllers/stripe/WebHookController";
import { StripeWebHookControllerConnect } from "../controllers/stripe/WebHookControllerConnect";

const stripeWebHooksRoutes = Router();
const stripeController = new StripeWebHooksController();
const stripeConnectController = new StripeWebHookControllerConnect();

// Nota: express.raw já é aplicado no server.ts para essas rotas
// Não aplicar novamente aqui para evitar conflitos
stripeWebHooksRoutes.post(
    "/webhook",
    stripeController.handleWebhook
);

stripeWebHooksRoutes.post(
    "/webhook/connect",
    (req, res) => stripeConnectController.handleConnectWebhook(req, res)
);

export { stripeWebHooksRoutes };