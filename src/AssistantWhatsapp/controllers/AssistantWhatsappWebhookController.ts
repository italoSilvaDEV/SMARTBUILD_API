import { Request, Response } from "express";
import {
  assistantWhatsappEnv,
  assertMetaSignatureConfig,
  assertMetaWebhookConfig,
} from "../config/env";
import { AssistantWhatsappMessageService } from "../services/AssistantWhatsappMessageService";
import { MetaWhatsappService } from "../services/MetaWhatsappService";
import { getRawBodyBuffer, verifyMetaSignature } from "../utils/metaSignature";

export class AssistantWhatsappWebhookController {
  private readonly metaService = new MetaWhatsappService();
  private readonly messageService = new AssistantWhatsappMessageService();

  verify(req: Request, res: Response) {
    try {
      assertMetaWebhookConfig();

      const mode = String(req.query["hub.mode"] || "");
      const token = String(req.query["hub.verify_token"] || "");
      const challenge = String(req.query["hub.challenge"] || "");

      if (mode === "subscribe" && token === assistantWhatsappEnv.webhookVerifyToken) {
        return res.status(200).send(challenge);
      }

      return res.status(403).send("Forbidden");
    } catch (error) {
      console.error("[AssistantWhatsappWebhookController.verify]", {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: "Webhook verification is not configured" });
    }
  }

  async receive(req: Request, res: Response) {
    let payload: any;

    try {
      assertMetaSignatureConfig();
      const rawBody = getRawBodyBuffer(req.body);
      const isValidSignature = verifyMetaSignature({
        appSecret: assistantWhatsappEnv.metaAppSecret,
        signatureHeader: req.headers["x-hub-signature-256"],
        rawBody,
      });

      if (!isValidSignature) {
        return res.status(401).json({ error: "Invalid Meta webhook signature" });
      }

      payload = JSON.parse(rawBody.toString("utf8") || "{}");
    } catch (error) {
      console.error("[AssistantWhatsappWebhookController.receive.parse]", {
        message: error instanceof Error ? error.message : String(error),
      });
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const messages = this.metaService.extractTextMessages(payload);
    const results = [];

    for (const message of messages) {
      try {
        results.push(await this.messageService.handleIncomingText(message));
      } catch (error) {
        console.error("[AssistantWhatsappWebhookController.receive.message]", {
          metaMessageId: message.id,
          from: message.from,
          message: error instanceof Error ? error.message : String(error),
        });
        results.push({ skipped: false, error: true, metaMessageId: message.id });
      }
    }

    return res.status(200).json({
      received: true,
      messages: messages.length,
      results,
    });
  }
}

