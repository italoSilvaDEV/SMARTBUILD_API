import { Router } from "express";
import express from 'express';
import { StripeWebHooksController } from "../controllers/stripe/WebHookController";

const stripeWebHooksRoutes = Router();
const stripeController = new StripeWebHooksController();

stripeWebHooksRoutes.post(
    "/webhook",
    express.raw({ type: 'application/json' }), // Importante para o Stripe validar o webhook
    stripeController.handleWebhook);

export { stripeWebHooksRoutes };