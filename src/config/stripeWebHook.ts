import Stripe from "stripe";
import { stripeConfig } from "./stripe";
import { prisma } from "../utils/prisma";

const stripe = stripeConfig.getClient();

export async function setupWebhook() {
  const webhookUrl = `${process.env.URL_API}/webhook`;

  /** eventos que você quer escutar */
  const EVENTS: { event: string; name: string }[] = [
    { event: "invoice.payment_succeeded", name: "Invoice payment" },
    { event: "checkout.session.completed", name: "Checkout completed" },
    { event: "customer.subscription.updated", name: "Subscription updated" }, // novo!
  ];

  try {
    for (const { event, name } of EVENTS) {
      const existing = await prisma.webhooks.findFirst({
        where: { event, status: "enabled" },
      });

      if (existing) {
        console.log(`Webhook already configured for ${event}: ${existing.id}`);
        continue;
      }

      const stripeWebhook = await stripe.webhookEndpoints.create({
        url: webhookUrl,
        enabled_events: [
            event as Stripe.WebhookEndpointCreateParams.EnabledEvent
        ],
      });

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

      console.log(`Webhook created for ${event}: ${stripeWebhook.id}`);
    }
  } catch (err) {
    console.error("Error while configuring webhooks:", err);
  }
}
