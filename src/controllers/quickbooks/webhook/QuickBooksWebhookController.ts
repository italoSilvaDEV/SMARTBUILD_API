// src/controllers/quickbooks/webhook/QuickBooksWebhookController.ts
import { Request, Response } from "express";
import { verifyIntuitSignature } from "../util/verifyIntuitSignature";
import { QuickBooksWebhookWorker } from "./QuickBooksWebhookWorker";

// src/controllers/quickbooks/webhook/QuickBooksWebhookController.ts
export class QuickBooksWebhookController {
  async handle(req: Request, res: Response) {
    try {
      

      const verifier = process.env.QBO_WEBHOOK_VERIFIER_TOKEN || "";
      const sig = req.header("intuit-signature");

      if (!verifier) {
        return res.status(500).send("verifier token not configured");
      }

      if (!sig) {
        return res.status(400).send("missing signature");
      }

      const raw = req.body as any;
      
      if (!verifyIntuitSignature(raw, sig, verifier)) {
        return res.status(401).send("invalid signature");
      }

      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(typeof raw === "string" ? raw : JSON.stringify(raw));
      const payload = JSON.parse(buf.toString("utf8"));


      res.status(200).send("ok");

      setImmediate(async () => {
        try { 
          await QuickBooksWebhookWorker.process(payload); 
        }
        catch (e: any) { 
        }
      });
    } catch (err: any) {
      res.status(200).send("ok"); // Sempre retorna 200 para não ficar reprocessando
    }
  }
}
