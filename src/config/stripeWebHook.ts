import Stripe from "stripe";
import { stripeConfig } from "./stripe";
import { prisma } from "../utils/prisma";

const stripe = stripeConfig.getClient();

/** Eventos para conta principal */
const MAIN_EVENTS: { event: string; name: string }[] = [
  { event: "invoice.payment_succeeded", name: "Invoice payment (main account)" },
  { event: "checkout.session.completed", name: "Checkout completed" },
  { event: "customer.subscription.updated", name: "Subscription updated" },
  { event: "customer.subscription.created", name: "Subscription created" },
  { event: "customer.subscription.deleted", name: "Subscription deleted" },
  { event: "invoice.payment_failed", name: "Invoice payment failed" },
  { event: "customer.updated", name: "Customer updated" }
];

/** Eventos para contas conectadas (Connect) */
const CONNECT_EVENTS: { event: string; name: string; url: string }[] = [
  { event: "invoice.payment_succeeded", name: "Invoice payment (connected account)", url: `${process.env.URL_API}/webhook/connect` },
  { event: "payment_intent.succeeded", name: "Payment Element succeeded (connected account)", url: `${process.env.URL_API}/webhook/connect` },
  { event: "payment_intent.payment_failed", name: "PI failed (connected)", url: `${process.env.URL_API}/webhook/connect` },
  { event: "payment_intent.processing", name: "PI processing (connected)", url: `${process.env.URL_API}/webhook/connect` },
  { event: "payment_intent.requires_action", name: "PI requires action - microdeposits (connected)", url: `${process.env.URL_API}/webhook/connect` },
  { event: "charge.dispute.created", name: "Dispute created (connected)", url: `${process.env.URL_API}/webhook/connect` },
];

/**
 * Função principal que configura todos os webhooks de uma vez.
 * Remove todos os webhooks existentes e recria tanto os principais quanto os Connect.
 */
export async function setupWebhook() {
  const mainWebhookUrl = `${process.env.URL_API}/webhook`;

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
        await (stripe.webhookEndpoints as any).del(webhook.id);
      }
      console.log("    Todos os webhooks removidos do Stripe");
    } else {
      console.log("\n[2] Nenhum webhook encontrado no Stripe para remover");
    }

    // Passo 3: Limpar a tabela de webhooks no banco de dados
    console.log("\n[3] Limpando webhooks do banco de dados...");
    const deletedDbWebhooks = await prisma.webhooks.deleteMany({});
    console.log(`    Removidos ${deletedDbWebhooks.count} registro(s) da tabela webhooks`);

    // Passo 4: Criar webhooks da conta principal
    console.log("\n[4] Criando webhooks da conta principal...");
    for (const { event, name } of MAIN_EVENTS) {
      console.log(`    Criando webhook para evento: ${event}`);

      const webhookOptions: Stripe.WebhookEndpointCreateParams = {
        url: mainWebhookUrl,
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

    // Passo 5: Criar webhooks Connect (contas conectadas)
    console.log("\n[5] Criando webhooks Connect...");
    for (const { event, name, url } of CONNECT_EVENTS) {
      console.log(`    Criando webhook Connect para evento: ${event}`);

      const webhookOptions: Stripe.WebhookEndpointCreateParams = {
        url: url,
        enabled_events: [event as Stripe.WebhookEndpointCreateParams.EnabledEvent],
        connect: true
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

      console.log(`    ✓ Webhook Connect criado: ${stripeWebhook.id} para evento ${event}`);
    }

    console.log("\n===========================================");
    console.log("WEBHOOKS RECONFIGURADOS COM SUCESSO!");
    console.log("===========================================");
  } catch (err) {
    console.error("Erro ao configurar webhooks:", err);
  }
}

/**
 * Função legacy para compatibility - redireciona para setupWebhook
 * @deprecated Use setupWebhook() que agora faz tudo
 */
export async function setupConnectWebhook() {
  console.log("setupConnectWebhook() está obsoleto. Use setupWebhook() que configura todos os webhooks.");
  // Não faz mais nada - a função principal setupWebhook() já cria os webhooks Connect
}
