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
    console.log("===========================================");
    console.log("INICIANDO RECONFIGURAÇÃO DE WEBHOOKS...");
    console.log("===========================================");

    // Passo 1: Buscar todos os webhooks existentes no Stripe
    console.log("\n[1] Buscando webhooks existentes no Stripe...");
    const existingStripeWebhooks = await stripe.webhookEndpoints.list();
    console.log(`    Encontrados ${existingStripeWebhooks.data.length} webhook(s) no Stripe`);

    // Passo 2: Remover todos os webhooks do Stripe
    if (existingStripeWebhooks.data.length > 0) {
      console.log("\n[2] Removendo webhooks existentes do Stripe...");
      for (const webhook of existingStripeWebhooks.data) {
        console.log(`    Removendo webhook: ${webhook.id} (url: ${webhook.url})`);
        await (stripe.webhookEndpoints as any).delete(webhook.id);
      }
      console.log("    Todos os webhooks removidos do Stripe");
    } else {
      console.log("\n[2] Nenhum webhook encontrado no Stripe para remover");
    }

    // Passo 3: Limpar a tabela de webhooks no banco de dados
    console.log("\n[3] Limpando webhooks do banco de dados...");
    const deletedDbWebhooks = await prisma.webhooks.deleteMany({});
    console.log(`    Removidos ${deletedDbWebhooks.count} registro(s) da tabela webhooks`);

    // Passo 4: Criar novos webhooks no Stripe e salvar no banco
    console.log("\n[4] Criando novos webhooks...");
    for (const { event, name } of EVENTS) {
      console.log(`    Criando webhook para evento: ${event}`);

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

      console.log(`    ✓ Webhook criado: ${stripeWebhook.id} para evento ${event}`);
    }

    console.log("\n===========================================");
    console.log("WEBHOOKS RECONFIGURADOS COM SUCESSO!");
    console.log("===========================================");
  } catch (err) {
    console.error("Erro ao configurar webhooks:", err);
  }
}

