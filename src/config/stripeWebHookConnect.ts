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
    console.log("================================================");
    console.log("INICIANDO RECONFIGURAÇÃO DE WEBHOOKS CONNECT...");
    console.log("================================================");

    // Passo 1: Buscar todos os webhooks existentes no Stripe
    console.log("\n[1] Buscando webhooks Connect existentes no Stripe...");
    const existingStripeWebhooks = await stripe.webhookEndpoints.list();
    console.log(`    Encontrados ${existingStripeWebhooks.data.length} webhook(s) no Stripe`);

    // Passo 2: Remover todos os webhooks do Stripe (incluindo Connect)
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
    console.log("\n[4] Criando novos webhooks Connect...");
    for (const { event, name, connect } of EVENTS) {
      console.log(`    Criando webhook Connect para evento: ${event}`);

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

      console.log(`    ✓ Webhook Connect criado: ${stripeWebhook.id} para evento ${event}`);
    }

    console.log("\n================================================");
    console.log("WEBHOOKS CONNECT RECONFIGURADOS COM SUCESSO!");
    console.log("================================================");
  } catch (err) {
    console.error("Erro ao configurar webhooks conectados:", err);
  }
} 