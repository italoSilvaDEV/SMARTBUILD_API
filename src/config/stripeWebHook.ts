import Stripe from "stripe";
import { stripeConfig } from "./stripe";
import { prisma } from "../utils/prisma";

const stripe = stripeConfig.getClient();

export async function setupWebhook() {
  const webhookUrl = `${process.env.URL_API}/webhook`;

  /** eventos que você quer escutar para conta principal */
  const EVENTS: { event: string; name: string }[] = [
    { event: "invoice.payment_succeeded", name: "Invoice payment (main account)" },
    { event: "checkout.session.completed", name: "Checkout completed" },
    { event: "customer.subscription.updated", name: "Subscription updated" },
    { event: "customer.subscription.created", name: "Subscription created" },
    { event: "customer.subscription.deleted", name: "Subscription deleted" },
    { event: "invoice.payment_failed", name: "Invoice payment failed" },
    { event: "customer.updated", name: "Customer updated" }
  ];

  try {
    for (const { event, name } of EVENTS) {
      const existing = await prisma.webhooks.findFirst({
        where: { 
          event, 
          status: "enabled",
          name: { contains: "main account" }
        },
      });

      if (existing) {
        console.log(`Webhook já configurado para ${event}: ${existing.id}`);
        continue;
      }

      // Opções base para criar webhook
      const webhookOptions: Stripe.WebhookEndpointCreateParams = {
        url: webhookUrl,
        enabled_events: [event as Stripe.WebhookEndpointCreateParams.EnabledEvent],
      };

      const stripeWebhook = await stripe.webhookEndpoints.create(webhookOptions);

      await prisma.webhooks.create({
        data: {
          name: `Webhook – ${name}`,
          event,
          secret: stripeWebhook.secret ?? "",
          url: stripeWebhook.url,
          status: "enabled",
          stripeId: stripeWebhook.id,
        },
      });

      console.log(`Webhook criado para ${event}: ${stripeWebhook.id}`);
    }
  } catch (err) {
    console.error("Erro ao configurar webhooks:", err);
  }
}

