import { Router } from "express";
import { AssistantWhatsappWebhookController } from "../AssistantWhatsapp/controllers/AssistantWhatsappWebhookController";

export const assistantWhatsappWebhookRoutes = Router();

const controller = new AssistantWhatsappWebhookController();

assistantWhatsappWebhookRoutes.get("/whatsapp/meta", (req, res) => controller.verify(req, res));
assistantWhatsappWebhookRoutes.post("/whatsapp/meta", (req, res) => controller.receive(req, res));

