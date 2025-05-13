import Stripe from "stripe";
import { stripeConfig } from "./stripe";
import { prisma } from "../utils/prisma";

const stripe = stripeConfig.getClient();

export async function setupConnectWebhook() {
  const webhookUrl = `${process.env.URL_API}/webhook/connect`;

  /** eventos que você quer escutar para contas conectadas */
  const EVENTS: { event: string; name: string; connect: boolean }[] = [
    { event: "invoice.payment_succeeded", name: "Invoice payment (connected account)", connect: true },
    // Outros eventos específicos para contas conectadas
  ];

  try {
    for (const { event, name, connect } of EVENTS) {
      const existing = await prisma.webhooks.findFirst({
        where: { event, status: "enabled", name: { contains: "connected account" } },
      });

      if (existing) {
        console.log(`Webhook conectado já configurado para ${event}: ${existing.id}`);
        continue;
      }

      // Opções específicas para webhooks de contas conectadas
      const webhookOptions: Stripe.WebhookEndpointCreateParams = {
        url: webhookUrl,
        enabled_events: [event as Stripe.WebhookEndpointCreateParams.EnabledEvent],
        connect: true // Sempre true para contas conectadas
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
        //   isConnectWebhook: true // Novo campo para identificar
        },
      });

      console.log(`Webhook conectado criado para ${event}: ${stripeWebhook.id}`);
    }
  } catch (err) {
    console.error("Erro ao configurar webhooks conectados:", err);
  }
} 