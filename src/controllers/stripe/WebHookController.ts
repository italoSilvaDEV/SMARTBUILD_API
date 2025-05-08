import { Request, Response } from "express";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { prisma } from "../../utils/prisma";

const stripe = stripeConfig.getClient();

export class StripeWebHooksController {
    async handleWebhook(req: Request, res: Response) {
        const sig = req.headers["stripe-signature"];

        try {
            const webhooks = await prisma.webhooks.findMany({ where: { status: "enabled" } });

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

            console.log("Processing event:", event.type);

            /* ---------- INVOICE PAID ---------- */
            console.log("processando pagamento invoice.payment_succeeded");
            if (event.type === "invoice.payment_succeeded") {
                const invoice = event.data.object as Stripe.Invoice;

                await prisma.invoice.updateMany({
                    where: { stripeInvoiceId: invoice.id },
                    data: { status: "paid" },
                });
                console.log("atualizado pagamento de invoice ");
            }

            /* ---------- CHECKOUT COMPLETED ---------- */
            else if (event.type === "checkout.session.completed") {
                console.log("processando pagamento checkout.session.completed");
                const session = event.data.object as Stripe.Checkout.Session;

                if (
                    session.mode === "subscription" &&
                    session.metadata?.planId &&
                    session.metadata?.companyId
                ) {
                    const { planId, companyId, startDate, endDate } = session.metadata;

                    await prisma.company.update({ where: { id: companyId }, data: { planId } });

                    const stripeSubscriptionId =
                        typeof session.subscription === "string"
                            ? session.subscription
                            : (session.subscription as Stripe.Subscription).id;

                    await prisma.subscription.create({
                        data: {
                            companyId,
                            planId,
                            startDate: new Date(startDate),
                            endDate: new Date(endDate),
                            isActive: true,
                            stripeSubscriptionId,
                        },
                    });
                }
            }

            /* ---------- SUBSCRIPTION UPDATED ---------- */
            else if (event.type === "customer.subscription.updated") {
                console.log("processando pagamento customer.subscription.updated")
                const sub = event.data.object as Stripe.Subscription;

                console.log("🔔  subscription.updated recebido:");
                console.log("   • Stripe subscription ID:", sub.id);
                console.log("   • Status:", sub.status);
                console.log("   • current_period_end (unix):", sub.current_period_end);

                // Busca assinatura local pelo ID do Stripe
                const localSub = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id },
                });

                if (!localSub) {
                    console.log("   ⚠️  Nenhuma assinatura local encontrada para este ID.");
                    return; // não faz nada se não existir no banco
                }

                console.log("   • Assinatura local encontrada:", localSub.id);

                const newEnd = new Date(sub.current_period_end * 1000);
                const isActive = sub.status === "active" || sub.status === "trialing";

                console.log("   • Novo endDate:", newEnd.toISOString());
                console.log("   • isActive calculado:", isActive);

                await prisma.subscription.update({
                    where: { id: localSub.id },
                    data: {
                        endDate: newEnd,
                        isActive,
                    },
                });
                console.log("   ✔️  Assinatura local atualizada.");

                // Verifica se houve troca de preço / plano
                const price = sub.items.data[0].price;
                const plan = await prisma.plan.findFirst({
                    where: { stripePriceId: price.id },
                });

                if (plan) {
                    console.log("   • Novo plano detectado:", plan.name, "(", plan.id, ")");
                    await prisma.company.update({
                        where: { id: localSub.companyId },
                        data: { planId: plan.id },
                    });
                    console.log("   ✔️  company.planId atualizado para", plan.id);
                } else {
                    console.log("   • Nenhum plano correspondente ao price.id", price.id);
                }
            }

            /* ---------- SUBSCRIPTION CREATED ---------- */
            else if (event.type === "customer.subscription.created") {
                console.log("processando pagamento customer.subscription.created");
                const sub = event.data.object as Stripe.Subscription;
            
                console.log("🔔  subscription.created recebido:");
                console.log("   • Stripe subscription ID:", sub.id);
                console.log("   • Status:", sub.status);
                console.log("   • current_period_end (unix):", sub.current_period_end);
            
                // Acessando o planId corretamente a partir do price.id
                const priceId = sub.items.data[0].price.id;  // O ID do preço associado ao plano
            
                // Buscar o plano baseado no priceId
                const plan = await prisma.plan.findFirst({
                  where: { stripePriceId: priceId }, // Usando price.id para encontrar o plano
                });
            
                if (!plan) {
                  console.log("   ⚠️  Nenhum plano encontrado com o price.id:", priceId);
                  return;
                }
            
                console.log("   • Novo plano detectado:", plan.name, "(", plan.id, ")");
            
                // Acessando o companyId da metadata
                const { companyId } = sub.metadata;
            
                // Atualizando o plano da empresa
                await prisma.company.update({
                  where: { id: companyId },
                  data: { planId: plan.id },
                });
                console.log("   ✔️  company.planId atualizado para", plan.id);
            
                // Criando o registro da assinatura no banco
                const newSubscription = await prisma.subscription.create({
                  data: {
                    companyId,
                    planId: plan.id,
                    startDate: new Date(sub.current_period_start * 1000), // Convertendo para formato Date
                    endDate: new Date(sub.current_period_end * 1000),   // Convertendo para formato Date
                    isActive: sub.status === "active" || sub.status === "trialing",
                    stripeSubscriptionId: sub.id,
                  },
                });
            
                console.log("   ✔️  Assinatura criada com sucesso:", newSubscription.id);
            }

            return res.json({ received: true });
        } catch (err: any) {
            console.error("Webhook error:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }
}
