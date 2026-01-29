import Stripe from "stripe";
import { stripeConfig } from "./stripe";
import { prisma } from "../utils/prisma";

const stripe = stripeConfig.getClient();

export async function setupConnectWebhook() {
  const webhookUrl = `${process.env.URL_API}/webhook/connect`;

  /** eventos que você quer escutar para contas conectadas */
  const EVENTS: { event: string; name: string; connect: boolean }[] = [
    // invoice payment succeeded
    { event: "invoice.payment_succeeded", name: "Invoice payment (connected account)", connect: true },

    // payment element
    { event: "payment_intent.succeeded", name: "Payment Element succeeded (connected account)", connect: true }, 
    { event: "payment_intent.payment_failed", name: "PI failed (connected)", connect: true },

     // ACH é "delayed notification": acompanhar o período de compensação
     { event: "payment_intent.processing", name: "PI processing (connected)", connect: true },

     // ACH microdeposits verification: quando o cliente precisa verificar a conta bancária
     { event: "payment_intent.requires_action", name: "PI requires action - microdeposits (connected)", connect: true },

     // Opcional, mas recomendado para retornos bancários/chargebacks de débito
    { event: "charge.dispute.created", name: "Dispute created (connected)", connect: true },
    
  ];

  try {
    // console.log("Verificando webhooks conectados existentes na base de dados...");
    
    for (const { event, name, connect } of EVENTS) {
      // Verificar apenas pelo evento, sem restrição de nome
      const existing = await prisma.webhooks.findFirst({ 
        where: { 
          name, 
          status: "enabled"
        },
      });

      if (existing) {
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