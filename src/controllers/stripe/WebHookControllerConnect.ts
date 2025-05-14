import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";

const stripe = stripeConfig.getClient();

export class StripeWebHookControllerConnect {
    async handleConnectWebhook(req: Request, res: Response) {
        const sig = req.headers["stripe-signature"];

        try {
            // Buscar apenas webhooks de contas conectadas
            const webhooks = await prisma.webhooks.findMany({ 
                where: { 
                    status: "enabled",
                    // isConnectWebhook: true
                } 
            });

            let event: Stripe.Event | null = null;
            for (const hook of webhooks) {
                try {
                    event = stripe.webhooks.constructEvent(req.body, sig as string, hook.secret);
                    break;
                } catch {
                    /* try next */
                }
            }

            if (!event) return res.status(400).send("Signature verification failed");

            console.log("Processing connect event:", event.type);

            /* ---------- INVOICE PAYMENT SUCCEEDED (CONNECT) ---------- */
            if (event.type === "invoice.payment_succeeded") {
                console.log("Processando pagamento invoice.payment_succeeded (Conta Conectada)");
                const invoice = event.data.object as Stripe.Invoice;
                
                // Verificamos que deve ser um evento de conta conectada
                const stripeEvent = event as Stripe.Event & { account?: string };
                
                if (stripeEvent.account) {
                    console.log("🔔 Invoice payment succeeded recebido (Conta Conectada):");
                    console.log("   • Conta Conectada:", stripeEvent.account);
                    
                    // Lógica específica para faturas de contas conectadas
                    await prisma.invoice.updateMany({
                        where: { stripeInvoiceId: invoice.id },
                        data: { status: "paid" },
                    });
                    
                    console.log("   ✅ Fatura de conta conectada atualizada como paga");
                }
            }
            
            // Outros handlers de eventos conectados podem ser adicionados aqui

            return res.json({ received: true });
        } catch (err: any) {
            console.error("Connect webhook error:", err.message);
            return res.status(400).send(`Connect webhook error: ${err.message}`);
        }
    }
} 