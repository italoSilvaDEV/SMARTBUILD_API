import { Router } from "express";
import express from "express";
import { QuickBooksWebhookController } from "../controllers/quickbooks/webhook/QuickBooksWebhookController";

export const quickbooksWebHooksRoutes = Router();
const ctrl = new QuickBooksWebhookController();

// ⚠️ Igual ao Stripe: define o caminho COMPLETO aqui
quickbooksWebHooksRoutes.post(
  "/webhooks/quickbooks",
  express.raw({ type: "*/*" }), // corpo cru para HMAC do QBO
  (req, res) => ctrl.handle(req, res)
);
