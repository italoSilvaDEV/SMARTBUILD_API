// src/controllers/quickbooks/webhook/QuickBooksWebhookController.ts
import { Request, Response } from "express";
import { verifyIntuitSignature } from "../util/verifyIntuitSignature";
import { QuickBooksWebhookWorker } from "./QuickBooksWebhookWorker";

// src/controllers/quickbooks/webhook/QuickBooksWebhookController.ts
export class QuickBooksWebhookController {
  async handle(req: Request, res: Response) {
    try {
      console.log("[QBO Webhook] hit", req.method, req.originalUrl, req.headers["content-type"]);
      const verifier = process.env.QBO_WEBHOOK_VERIFIER_TOKEN || "";
      const sig = req.header("intuit-signature");

      const raw = req.body as any;
      if (!verifyIntuitSignature(raw, sig, verifier)) {
        console.warn("[QBO Webhook] assinatura inválida");
        return res.status(401).send("invalid signature");
      }

      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw));
      const payload = JSON.parse(buf.toString("utf8"));

      res.status(200).send("ok");

      setImmediate(async () => {
        try { await QuickBooksWebhookWorker.process(payload); }
        catch (e: any) { console.error("[QBO Webhook] worker error:", e?.message || e); }
      });
    } catch (err: any) {
      console.error("[QBO Webhook] erro:", err?.message || err);
      res.status(200).send("ok");
    }
  }
}
