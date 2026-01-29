// src/controllers/quickbooks/webhook/QuickBooksWebhookController.ts
import { Request, Response } from "express";
import { verifyIntuitSignature } from "../util/verifyIntuitSignature";
import { QuickBooksWebhookWorker } from "./QuickBooksWebhookWorker";

// src/controllers/quickbooks/webhook/QuickBooksWebhookController.ts
export class QuickBooksWebhookController {
  async handle(req: Request, res: Response) {
    try {
      // console.log("========================================");
      // console.log("[QBO Webhook]  RECEBIDO");
      // console.log("[QBO Webhook] Method:", req.method);
      // console.log("[QBO Webhook] URL:", req.originalUrl);
      // console.log("[QBO Webhook] Content-Type:", req.headers["content-type"]);
      // console.log("[QBO Webhook] Has intuit-signature:", !!req.header("intuit-signature"));
      // console.log("[QBO Webhook] Body type:", typeof req.body);
      // console.log("[QBO Webhook] Body is Buffer:", Buffer.isBuffer(req.body));
      

      const verifier = process.env.QBO_WEBHOOK_VERIFIER_TOKEN || "";
      const sig = req.header("intuit-signature");

      if (!verifier) {
        // console.error("[QBO Webhook]  QBO_WEBHOOK_VERIFIER_TOKEN não configurado!");
        return res.status(500).send("verifier token not configured");
      }

      if (!sig) {
        // console.error("[QBO Webhook]  Cabeçalho intuit-signature não encontrado!");
        return res.status(400).send("missing signature");
      }

      const raw = req.body as any;
      
      // console.log("[QBO Webhook] Verificando assinatura HMAC...");
      if (!verifyIntuitSignature(raw, sig, verifier)) {
        // console.warn("[QBO Webhook]  Assinatura inválida");
        return res.status(401).send("invalid signature");
      }
      // console.log("[QBO Webhook]  Assinatura válida!");

      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw));
      const payload = JSON.parse(buf.toString("utf8"));

      // console.log("[QBO Webhook]  Payload parseado com sucesso");
      // console.log("[QBO Webhook] Eventos recebidos:", payload?.eventNotifications?.length || 0);

      res.status(200).send("ok");

      setImmediate(async () => {
        try { 
          // console.log("[QBO Webhook]  Iniciando processamento...");
          await QuickBooksWebhookWorker.process(payload); 
          // console.log("[QBO Webhook]  Processamento concluído");
        }
        catch (e: any) { 
          // console.error("[QBO Webhook]  Erro no worker:", e?.message || e);
          // console.error("[QBO Webhook] Stack:", e?.stack);
        }
      });
    } catch (err: any) {
      // console.error("[QBO Webhook] ERRO GERAL:", err?.message || err);
      // console.error("[QBO Webhook] Stack:", err?.stack);
      res.status(200).send("ok"); // Sempre retorna 200 para não ficar reprocessando
    }
  }
}
