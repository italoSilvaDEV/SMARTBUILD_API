import { Request, Response } from "express";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { prisma } from "../../utils/prisma";

const stripe = stripeConfig.getClient();

export class StripeWebHooksController {
    constructor() {
        this.handleWebhook = this.handleWebhook.bind(this);
    }

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

          
            if (event.type === "invoice.payment_succeeded") {
                const invoice = event.data.object as Stripe.Invoice;
                
                
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
                        
                    }
                }
            }

            /* ---------- CHECKOUT COMPLETED ---------- */
            else if (event.type === "checkout.session.completed") {
                const session = event.data.object as Stripe.Checkout.Session;

                if (session.mode === "subscription") {
                    //  Sistema interno usa metadata
                    const { planId, companyId, referralId } = session.metadata || {};
                    
                    // Log separado: Rewardful usa client_reference_id
                    if (session.client_reference_id) {
                    }
                    
                    //  Log separado: Sistema interno usa metadata  
                    if (referralId && referralId !== session.client_reference_id) {
                    }

                    if (companyId && planId) {

                        // Atualizar a empresa com o novo plano e allowedEmployees
                        await prisma.company.update({
                            where: { id: companyId },
                            data: { 
                                planId,
                                // Verificar se temos allowedEmployees no metadata
                                ...(session.metadata?.allowedEmployees && {
                                    allowedEmployees: parseInt(session.metadata.allowedEmployees)
                                })
                            }
                        });


                        // Identificar a assinatura Stripe criada por este checkout
                        const stripeSubscriptionId = typeof session.subscription === "string"
                            ? session.subscription
                            : session.subscription?.id;


                        // NÃO vamos desativar assinaturas antigas aqui
                        // Isso será feito de forma segura no evento subscription.created
                    }
                }
            }

            /* ---------- SUBSCRIPTION UPDATED ---------- */
            else if (event.type === "customer.subscription.updated") {
                const sub = event.data.object as Stripe.Subscription;


                // Busca assinatura local pelo ID do Stripe
                const localSub = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id },
                });

                if (!localSub) {
                    return res.json({ received: true }); // não faz nada se não existir no banco
                }


                const newEnd = new Date(sub.current_period_end * 1000);
                
                // Verificar tipo de cancelamento
                if (sub.status === 'canceled') {
                    // Cancelamento imediato
                    
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: { 
                            isActive: false,
                            stripeSubscriptionCanceled: true,
                            stripeDateSubscriptionCanceled: new Date() // Data atual para cancelamento imediato
                        }
                    });
                    
                    return res.json({ received: true });
                } 
                else if (sub.cancel_at_period_end) {
                    // Cancelamento agendado para o final do período
                    
                    // Manter assinatura ativa até o final do período
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: {
                            endDate: newEnd,
                            isActive: true,
                            stripeSubscriptionCanceled: false,
                            stripeDateSubscriptionCanceled: newEnd // Data de término da assinatura
                        }
                    });
                    
                }
                else {
                    // Para outros casos, continua com a lógica normal
                    const isActive = sub.status === "active" || sub.status === "trialing";
                    
                    
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: {
                            endDate: newEnd,
                            isActive,
                            // Remover data de cancelamento caso a assinatura tenha sido reativada
                            ...(isActive && { stripeDateSubscriptionCanceled: null })
                        }
                    });
                    
                }

                // Verifica se houve troca de preço / plano
                const price = sub.items.data[0].price;

                const plan = await prisma.plan.findFirst({
                    where: { stripePriceId: price.id },
                });

                if (plan) {
                    
                    // Buscar allowedEmployees do plano
                    const allowedEmployeesFromPlan = plan.allowedEmployees;
                    
                    // Buscar a empresa para verificar se já tem um allowedEmployees definido
                    const company = await prisma.company.findUnique({
                        where: { id: localSub.companyId },
                        select: { allowedEmployees: true }
                    });

                    
                    // Atualizar a empresa com o novo plano e allowedEmployees se necessário
                    await prisma.company.update({
                        where: { id: localSub.companyId },
                        data: { 
                            planId: plan.id,
                            // Sempre substituir allowedEmployees pelo valor do plano
                            allowedEmployees: allowedEmployeesFromPlan
                        },
                    });

                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: {
                            planId: plan.id,
                        },
                    });
                } else {
                }
            }

            /* ---------- SUBSCRIPTION CREATED ---------- */
            else if (event.type === "customer.subscription.created") {
                const sub = event.data.object as Stripe.Subscription;


                // Verificar se temos o companyId na metadata
                const { companyId } = sub.metadata;

                if (!companyId) {
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
                    if (relatedSession) {

                        //  Sistema interno usa metadata
                        const companyIdFromSession = relatedSession.metadata?.companyId;
                        
                        //  Log do Rewardful se existir
                        if (relatedSession.client_reference_id) {
                        }

                        if (companyIdFromSession) {

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
                                return res.json({ received: true });
                            }


                            // Salvar o stripeCustomerId na tabela Company
                            const stripeCustomerId = typeof sub.customer === 'string' 
                                ? sub.customer 
                                : sub.customer.id;
                            
                            
                            // Atualizar o plano e o stripeCustomerId da empresa
                            await prisma.company.update({
                                where: { id: companyIdFromSession },
                                data: { 
                                    planId: plan.id,
                                    stripeCustomerId: stripeCustomerId,
                                    // Verificar se a sessão tem allowedEmployees no metadata
                                    ...(relatedSession.metadata?.allowedEmployees && {
                                        allowedEmployees: parseInt(relatedSession.metadata.allowedEmployees)
                                    })
                                }
                            });

                            // Criar assinatura no banco
                            const newSubscription = await prisma.subscription.create({
                                data: {
                                    companyId: companyIdFromSession,
                                    planId: plan.id,
                                    startDate: new Date(sub.current_period_start * 1000),
                                    endDate: new Date(sub.current_period_end * 1000),
                                    isActive: true, // Sempre começar como ativa, independente do status no Stripe
                                    stripeSubscriptionId: sub.id,
                                    stripeSubscriptionCanceled: false, // Inicializar como não cancelada
                                    paymentFailed: false, // Inicializar como sem falha de pagamento
                                    stripeDateSubscriptionCanceled: null // Inicializar como não cancelada
                                }
                            });

                            return res.json({ received: true });
                        } else {
                            return res.json({ received: true });
                        }
                    } else {
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

                    // Salvar o stripeCustomerId na tabela Company
                    const stripeCustomerId = typeof sub.customer === 'string' 
                        ? sub.customer 
                        : sub.customer.id;
                    
                    
                    // Buscar o plano baseado no priceId
                    const priceId = sub.items.data[0].price.id;
                    const plan = await prisma.plan.findFirst({
                        where: { stripePriceId: priceId },
                    });
                    
                    if (!plan) {
                        // Ainda assim, vamos atualizar o stripeCustomerId
                        await prisma.company.update({
                            where: { id: companyId },
                            data: { stripeCustomerId }
                        });
                        return res.json({ received: true });
                    }
                    
                    // Atualizar o plano e o stripeCustomerId da empresa
                    await prisma.company.update({
                        where: { id: companyId },
                        data: { 
                            planId: plan.id,
                            stripeCustomerId,
                            // Se ainda não tem allowedEmployees, pegar do plano
                            allowedEmployees: plan.allowedEmployees
                        }
                    });
                    
                    // Criar a nova assinatura local
                    const newSubscription = await prisma.subscription.create({
                        data: {
                            companyId,
                            planId: plan.id,
                            startDate: new Date(sub.current_period_start * 1000),
                            endDate: new Date(sub.current_period_end * 1000),
                            isActive: true, // Sempre começar como ativa, independente do status no Stripe
                            stripeSubscriptionId: sub.id,
                            stripeSubscriptionCanceled: false, // Inicializar como não cancelada
                            paymentFailed: false, // Inicializar como sem falha de pagamento
                            stripeDateSubscriptionCanceled: null // Inicializar como não cancelada
                        }
                    });
                    
                }
            }

            /* ---------- SUBSCRIPTION DELETED ---------- */
            else if (event.type === "customer.subscription.deleted") {
                const sub = event.data.object as Stripe.Subscription;


                // Buscar a assinatura no banco de dados
                const localSubscription = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id }
                });

                if (!localSubscription) {
                    return res.json({ received: true });
                }


                // Este evento ocorre quando:
                // 1. Assinatura foi cancelada imediatamente (não no fim do período)
                // 2. Assinatura com cancelamento no fim do período chegou ao final
                
                // Em ambos os casos, devemos marcar como inativa e cancelada
                await prisma.subscription.update({
                    where: { id: localSubscription.id },
                    data: { 
                        isActive: false,
                        stripeSubscriptionCanceled: true
                    }
                });

                // Nota: Mantemos o usuário no mesmo plano, apenas com assinatura inativa e cancelada
                // Isso permitirá que o front-end mostre a página "subscription expired/canceled"
            }

            /* ---------- PAYMENT INTENT SUCCEEDED (PAYMENT ELEMENT) ---------- */
            // else if (event.type === "payment_intent.succeeded") {
            //     console.log("Processando payment_intent.succeeded (Payment Element - Conta Principal)");
            //     const paymentIntent = event.data.object as Stripe.PaymentIntent;
                
            //     console.log("Payment Intent succeeded recebido (Conta Principal):");
            //     console.log("   • PaymentIntent ID:", paymentIntent.id);
            //     console.log("   • Amount:", paymentIntent.amount_received);
            //     console.log("   • Currency:", paymentIntent.currency);
            //     console.log("   • Receipt URL:", (paymentIntent as any).receipt_url);
            //     console.log("   • PaymentIntent:", JSON.stringify(paymentIntent, null, 2));
                
            //     // Buscar PaymentIntentRecord no banco
            //     const paymentRecord = await prisma.paymentIntentRecord.findUnique({
            //         where: { stripePaymentIntentId: paymentIntent.id },
            //         include: {
            //             invoice: {
            //                 include: {
            //                     project: {
            //                         include: {
            //                             client: {
            //                                 select: {
            //                                     id: true,
            //                                     name: true,
            //                                     email: true,
            //                                     phone: true
            //                                 }
            //                             }
            //                         }
            //                     },
            //                     company: {
            //                         select: {
            //                             id: true,
            //                             name: true,
            //                             avatar: true,
            //                             email: true,
            //                             phone: true
            //                         }
            //                     }
            //                 }
            //             }
            //         }
            //     });
                
            //     if (paymentRecord && paymentRecord.invoice) {
            //         console.log("PaymentRecord encontrado para invoice:", paymentRecord.invoice.id);
                    
            //         // Buscar receipt_url do Charge associado ao PaymentIntent
            //         let receiptUrl = null;
            //         try {
            //             if (paymentIntent.latest_charge) {
            //                 const chargeId = typeof paymentIntent.latest_charge === 'string' 
            //                     ? paymentIntent.latest_charge 
            //                     : paymentIntent.latest_charge.id;
                            
            //                 const charge = await stripe.charges.retrieve(chargeId);
            //                 receiptUrl = charge.receipt_url;
            //                 console.log("Receipt URL encontrado:", receiptUrl);
            //             }
            //         } catch (chargeError) {
            //             console.error("Erro ao buscar charge para receipt URL:", chargeError);
            //         }
                    
            //         // Atualizar status do PaymentIntentRecord e salvar receipt URL
            //         await prisma.paymentIntentRecord.update({
            //             where: { stripePaymentIntentId: paymentIntent.id },
            //             data: { 
            //                 status: "succeeded",
            //                 receiptUrl: receiptUrl,
            //                 updatedAt: new Date()
            //             }
            //         });
                    
            //         // Atualizar status da Invoice para "paid"
            //         await prisma.invoice.update({
            //             where: { id: paymentRecord.invoice.id },
            //             data: { 
            //                 status: "paid",
            //                 stripePaymentIntentId: paymentIntent.id
            //             }
            //         });
                    
            //         console.log("Invoice atualizada como paga via Payment Element (Conta Principal)");
                    
            //         // Registrar timeline
            //         await prisma.invoiceTimeline.create({
            //             data: {
            //                 description: `Payment completed via Payment Element - Amount: $${(paymentIntent.amount_received / 100).toFixed(2)}`,
            //                 invoiceId: paymentRecord.invoice.id
            //             }
            //         });
                    
            //         // Enviar emails de confirmação (usando mesma lógica do WebHookControllerConnect)
            //         try {
            //             await this.sendPaymentConfirmationEmails(paymentRecord.invoice, paymentIntent);
            //         } catch (emailError: any) {
            //             console.error("Erro ao enviar emails de confirmação (Payment Element):", emailError.message);
            //         }
                    
            //     } else {
            //         console.log("PaymentIntentRecord não encontrado no banco de dados local");
            //     }
            // }

            /* ---------- INVOICE PAYMENT FAILED ---------- */
            else if (event.type === "invoice.payment_failed") {
                const invoice = event.data.object as Stripe.Invoice;


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

                        // Atualizar a assinatura como pagamento falho
                        await prisma.subscription.update({
                            where: { id: subscription.id },
                            data: { paymentFailed: true }
                        });

                    } else {
                    }
                }
            }

            return res.json({ received: true });
        } catch (err: any) {
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }
}
