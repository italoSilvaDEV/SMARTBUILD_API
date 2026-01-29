import Stripe from "stripe";
import { stripeConfig } from "./stripe";
import { prisma } from "../utils/prisma";

const stripe = stripeConfig.getClient();

export async function setupWebhook() {
  const webhookUrl = `${process.env.URL_API}/webhook`;

  /** eventos que você quer escutar para conta principal */
  const EVENTS: { event: string; name: string }[] = [
    { event: "invoice.payment_succeeded", name: "Invoice payment (main account)" },
    // para caso usar o payment element na conta principal 
    // { event: "payment_intent.succeeded", name: "Payment Element succeeded (main account)" },

    { event: "checkout.session.completed", name: "Checkout completed" },
    { event: "customer.subscription.updated", name: "Subscription updated" },
    { event: "customer.subscription.created", name: "Subscription created" },
    { event: "customer.subscription.deleted", name: "Subscription deleted" },
    { event: "invoice.payment_failed", name: "Invoice payment failed" },
    { event: "customer.updated", name: "Customer updated" }
  ];

  try {
    // console.log("Verificando webhooks existentes na base de dados...");
    
    for (const { event, name } of EVENTS) {
      // Verificar se já existe webhook para este evento (sem filtrar por nome)
      const existing = await prisma.webhooks.findFirst({
        where: { 
          name, 
          status: "enabled"
        },
      });

      if (existing) {
        continue;
      }

      // console.log(`Criando novo webhook para ${event}...`);
      // Opções base para criar webhook
      const webhookOptions: Stripe.WebhookEndpointCreateParams = {
        url: webhookUrl,
        enabled_events: [event as Stripe.WebhookEndpointCreateParams.EnabledEvent],
      };

      const stripeWebhook = await stripe.webhookEndpoints.create(webhookOptions);

      await prisma.webhooks.create({
        data: {
          name: `${name}`,
          event,
          secret: stripeWebhook.secret ?? "",
          url: stripeWebhook.url,
          status: "enabled",
          stripeId: stripeWebhook.id,
        },
      });

    }
  } catch (err) {
  }
}

