import { Router } from "express";
import express from 'express';
import { StripeWebHooksController } from "../controllers/stripe/WebHookController";
import { StripeWebHookControllerConnect } from "../controllers/stripe/WebHookControllerConnect";

const stripeWebHooksRoutes = Router();
const stripeController = new StripeWebHooksController();
const stripeConnectController = new StripeWebHookControllerConnect();

stripeWebHooksRoutes.post(
    "/webhook",
    express.raw({ type: 'application/json' }), // Importante para o Stripe validar o webhook
    stripeController.handleWebhook);

stripeWebHooksRoutes.post(
    "/webhook/connect",
    express.raw({ type: 'application/json' }), // Importante para o Stripe validar o webhook
    (req, res) => stripeConnectController.handleConnectWebhook(req, res));

export { stripeWebHooksRoutes };