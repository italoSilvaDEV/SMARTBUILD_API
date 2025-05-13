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
            // console.log("processando pagamento invoice.payment_succeeded");
            // if (event.type === "invoice.payment_succeeded") {
            //     const invoice = event.data.object as Stripe.Invoice;

            //     await prisma.invoice.updateMany({
            //         where: { stripeInvoiceId: invoice.id },
            //         data: { status: "paid" },
            //     });
            //     console.log("atualizado pagamento de invoice ");
            // }

            if (event.type === "invoice.payment_succeeded") {
                console.log("Processando pagamento invoice.payment_succeeded (Conta Principal)");
                const invoice = event.data.object as Stripe.Invoice;
                
                console.log("🔔 Invoice payment succeeded recebido (Conta Principal):");
                console.log("   • Invoice ID:", invoice.id);
                console.log("   • Subscription:", invoice.subscription);
                
                if (invoice.subscription) {
                    const subscription = await prisma.subscription.findFirst({
                        where: { 
                            stripeSubscriptionId: typeof invoice.subscription === 'string' 
                                ? invoice.subscription 
                                : invoice.subscription.id
                        }
                    });
                    
                    if (subscription) {
                        // Atualizar status paymentFailed para false
                        await prisma.subscription.update({
                            where: { id: subscription.id },
                            data: { paymentFailed: false }
                        });
                        
                        console.log("   ✅ Assinatura na conta principal atualizada");
                    }
                }
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
                    const { planId, companyId } = session.metadata;
                    console.log("Checkout completado para companyId:", companyId, "planId:", planId);

                    // Apenas atualizar a empresa com o novo plano
                    await prisma.company.update({
                        where: { id: companyId },
                        data: { planId }
                    });

                    console.log("✅ Empresa atualizada com novo plano");

                    // Identificar a assinatura Stripe criada por este checkout
                    const stripeSubscriptionId = typeof session.subscription === "string"
                        ? session.subscription
                        : session.subscription?.id;

                    console.log("✅ Nova assinatura Stripe ID:", stripeSubscriptionId);

                    // NÃO vamos desativar assinaturas antigas aqui
                    // Isso será feito de forma segura no evento subscription.created
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
                console.log("   • canceled_at (unix):", sub.canceled_at || "não cancelada");

                // Busca assinatura local pelo ID do Stripe
                const localSub = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id },
                });

                if (!localSub) {
                    console.log("   ⚠️  Nenhuma assinatura local encontrada para este ID.");
                    return res.json({ received: true }); // não faz nada se não existir no banco
                }

                console.log("   • Assinatura local encontrada:", localSub.id);

                const newEnd = new Date(sub.current_period_end * 1000);

                // Verifica explicitamente se a assinatura foi cancelada
                if (sub.status === 'canceled' || sub.canceled_at) {
                    console.log("   ⚠️ Assinatura cancelada detectada!");

                    // Desativar a assinatura imediatamente
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: { isActive: false }
                    });

                    console.log("   ✅ Assinatura marcada como inativa devido ao cancelamento");
                    return res.json({ received: true });
                }

                // Para outros casos, continua com a lógica normal
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

                // Verificar se temos o companyId na metadata
                const { companyId } = sub.metadata;

                if (!companyId) {
                    console.log("   ⚠️  Nenhum companyId encontrado na metadata, verificando por checkout.session.completed");
                    // Buscar o checkout.session que originou essa assinatura
                    // A assinatura geralmente é criada logo após o checkout.session.completed
                    const checkoutSessions = await stripe.checkout.sessions.list({
                        limit: 10,
                        expand: ['data.subscription']
                    });

                    // Encontrar a sessão que criou esta assinatura
                    const relatedSession = checkoutSessions.data.find(session =>
                        session.subscription &&
                        (typeof session.subscription === 'string'
                            ? session.subscription === sub.id
                            : session.subscription.id === sub.id)
                    );

                    if (relatedSession && relatedSession.metadata?.companyId) {
                        console.log("   ✔️  Encontrado companyId na sessão de checkout:", relatedSession.metadata.companyId);

                        // Usar o companyId da sessão de checkout
                        const companyIdFromSession = relatedSession.metadata.companyId;

                        // Atualizar a metadata da assinatura para incluir o companyId
                        await stripe.subscriptions.update(sub.id, {
                            metadata: {
                                ...sub.metadata,
                                companyId: companyIdFromSession
                            }
                        });

                        // Acessando o planId corretamente a partir do price.id
                        const priceId = sub.items.data[0].price.id;

                        // Buscar o plano baseado no priceId
                        const plan = await prisma.plan.findFirst({
                            where: { stripePriceId: priceId },
                        });

                        if (!plan) {
                            console.log("   ⚠️  Nenhum plano encontrado com o price.id:", priceId);
                            return res.json({ received: true });
                        }

                        console.log("   • Novo plano detectado:", plan.name, "(", plan.id, ")");

                        // Atualizar o plano da empresa
                        await prisma.company.update({
                            where: { id: companyIdFromSession },
                            data: { planId: plan.id }
                        });
                        console.log("   ✔️  company.planId atualizado para", plan.id);

                        // Criar assinatura no banco
                        const newSubscription = await prisma.subscription.create({
                            data: {
                                companyId: companyIdFromSession,
                                planId: plan.id,
                                startDate: new Date(sub.current_period_start * 1000),
                                endDate: new Date(sub.current_period_end * 1000),
                                isActive: sub.status === "active" || sub.status === "trialing",
                                stripeSubscriptionId: sub.id
                            }
                        });

                        console.log("   ✔️  Assinatura criada com sucesso:", newSubscription.id);
                        return res.json({ received: true });
                    } else {
                        console.log("   ⚠️  Não foi possível encontrar a sessão relacionada à assinatura");
                        return res.json({ received: true });
                    }
                }

                // Se chegamos aqui, temos um companyId válido
                if (companyId) {
                    // Verificar se já existe uma assinatura local para esta assinatura Stripe
                    const existingSubscription = await prisma.subscription.findFirst({
                        where: { stripeSubscriptionId: sub.id }
                    });

                    if (existingSubscription) {
                        console.log("⚠️ Assinatura já existe no banco:", existingSubscription.id);
                        // Não fazer nada, a assinatura já foi processada
                        return res.json({ received: true });
                    }

                    // Desativar assinaturas anteriores, incluindo planos FREE sem stripeSubscriptionId
                    await prisma.subscription.updateMany({
                        where: {
                            companyId,
                            isActive: true,
                            OR: [
                                { stripeSubscriptionId: { not: sub.id } },
                                { stripeSubscriptionId: null }
                            ]
                        },
                        data: { isActive: false }
                    });
                    console.log("✅ Assinaturas anteriores (incluindo planos FREE) marcadas como inativas");

                    // Criar a nova assinatura local
                    // (resto do código para criar assinatura...)
                }
            }

            /* ---------- SUBSCRIPTION DELETED ---------- */
            else if (event.type === "customer.subscription.deleted") {
                console.log("processando pagamento customer.subscription.deleted");
                const sub = event.data.object as Stripe.Subscription;

                console.log("🔔  subscription.deleted recebido:");
                console.log("   • Stripe subscription ID:", sub.id);
                console.log("   • Status:", sub.status);

                // Buscar a assinatura no banco de dados
                const localSubscription = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id }
                });

                if (!localSubscription) {
                    console.log("   ⚠️  Nenhuma assinatura local encontrada para este ID.");
                    return res.json({ received: true });
                }

                console.log("   • Assinatura local encontrada:", localSubscription.id);

                // Desativar a assinatura
                await prisma.subscription.update({
                    where: { id: localSubscription.id },
                    data: { isActive: false }
                });
                console.log("   ✅ Assinatura marcada como inativa");

                // Nota: Mantemos o usuário no mesmo plano, apenas com assinatura inativa
                // Isso permitirá que o front-end mostre a página "subscription expired"
            }

            /* ---------- INVOICE PAYMENT FAILED ---------- */
            else if (event.type === "invoice.payment_failed") {
                console.log("processando evento invoice.payment_failed");
                const invoice = event.data.object as Stripe.Invoice;

                console.log("🔔 Invoice payment failed recebido:");
                console.log("   • Invoice ID:", invoice.id);
                console.log("   • Subscription:", invoice.subscription);

                if (invoice.subscription) {
                    // Buscar a assinatura no nosso banco pelo subscription ID
                    const subscription = await prisma.subscription.findFirst({
                        where: {
                            stripeSubscriptionId: typeof invoice.subscription === 'string'
                                ? invoice.subscription
                                : invoice.subscription.id
                        }
                    });

                    if (subscription) {
                        console.log("   • Assinatura local encontrada:", subscription.id);

                        // Atualizar a assinatura como pagamento falho
                        await prisma.subscription.update({
                            where: { id: subscription.id },
                            data: { paymentFailed: true }
                        });

                        console.log("   ✅ Assinatura marcada com pagamento falho");
                    } else {
                        console.log("   ⚠️ Nenhuma assinatura local encontrada para este ID");
                    }
                }
            }

            return res.json({ received: true });
        } catch (err: any) {
            console.error("Webhook error:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }
}
