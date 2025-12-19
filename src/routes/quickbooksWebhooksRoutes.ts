import { Router } from "express";
import express from "express";
import { QuickBooksWebhookController } from "../controllers/quickbooks/webhook/QuickBooksWebhookController";

export const quickbooksWebHooksRoutes = Router();
const ctrl = new QuickBooksWebhookController();

quickbooksWebHooksRoutes.post(
  "/quickbooks",
  (req, res) => ctrl.handle(req, res)
);
 