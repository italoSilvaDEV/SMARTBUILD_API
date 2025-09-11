import { Request, Response } from "express";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { prisma } from "../../utils/prisma";
import nodemailer from "nodemailer";
import { invoicePaymentConfirmation } from "../../templateEmail/invoicePaymentConfirmation";
import { invoicePaymentNotificationCompany } from "../../templateEmail/invoicePaymentNotificationCompany";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const stripe = stripeConfig.getClient();

export class StripeWebHooksController {
    constructor() {
        this.handleWebhook = this.handleWebhook.bind(this);
        this.sendPaymentConfirmationEmails = this.sendPaymentConfirmationEmails.bind(this);
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

            console.log("Processing event:", event.type);
          
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

                if (session.mode === "subscription") {
                    // ✅ Sistema interno usa metadata
                    const { planId, companyId, referralId } = session.metadata || {};
                    
                    // ✅ Log separado: Rewardful usa client_reference_id
                    if (session.client_reference_id) {
                        console.log('🎯 [Rewardful] Referral ID detectado:', session.client_reference_id);
                    }
                    
                    // ✅ Log separado: Sistema interno usa metadata  
                    if (referralId && referralId !== session.client_reference_id) {
                        console.log('📋 [Backup] Referral ID também encontrado nos metadados:', referralId);
                    }

                    if (companyId && planId) {
                        console.log("✅ Checkout completado para companyId:", companyId, "planId:", planId);

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
                
                // Verificar tipo de cancelamento
                if (sub.status === 'canceled') {
                    // Cancelamento imediato
                    console.log("   ⚠️ Assinatura cancelada imediatamente detectada!");
                    
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: { 
                            isActive: false,
                            stripeSubscriptionCanceled: true,
                            stripeDateSubscriptionCanceled: new Date() // Data atual para cancelamento imediato
                        }
                    });
                    
                    console.log("   ✅ Assinatura marcada como inativa e cancelada imediatamente");
                    return res.json({ received: true });
                } 
                else if (sub.cancel_at_period_end) {
                    // Cancelamento agendado para o final do período
                    console.log("   ⚠️ Cancelamento ao final do período detectado");
                    console.log("   • Data de término do período:", newEnd.toISOString());
                    
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
                    
                    console.log("   ✅ Assinatura permanecerá ativa até o final do período");
                }
                else {
                    // Para outros casos, continua com a lógica normal
                    const isActive = sub.status === "active" || sub.status === "trialing";
                    
                    console.log("   • Novo endDate:", newEnd.toISOString());
                    console.log("   • isActive calculado:", isActive);
                    
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: {
                            endDate: newEnd,
                            isActive,
                            // Remover data de cancelamento caso a assinatura tenha sido reativada
                            ...(isActive && { stripeDateSubscriptionCanceled: null })
                        }
                    });
                    
                    console.log("   ✔️  Assinatura local atualizada.");
                }

                // Verifica se houve troca de preço / plano
                const price = sub.items.data[0].price;

                console.log("esse é o price", JSON.stringify(price, null, 2));
                const plan = await prisma.plan.findFirst({
                    where: { stripePriceId: price.id },
                });

                if (plan) {
                    console.log("   • Novo plano detectado:", plan.name, "(", plan.id, ")");
                    
                    // Buscar allowedEmployees do plano
                    const allowedEmployeesFromPlan = plan.allowedEmployees;
                    
                    // Buscar a empresa para verificar se já tem um allowedEmployees definido
                    const company = await prisma.company.findUnique({
                        where: { id: localSub.companyId },
                        select: { allowedEmployees: true }
                    });

                    console.log("esse é oallowedEmployeesFromPlan", allowedEmployeesFromPlan);
                    
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
                    console.log("   ✔️  Assinatura local atualizada.");
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
                console.log("   • Customer ID:", sub.customer);

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
                    if (relatedSession) {
                        console.log("   ✔️  Encontrada sessão de checkout relacionada:", relatedSession.id);

                        // ✅ Sistema interno usa metadata
                        const companyIdFromSession = relatedSession.metadata?.companyId;
                        
                        // ✅ Log do Rewardful se existir
                        if (relatedSession.client_reference_id) {
                            console.log('🎯 [Rewardful] Referral ID na sessão:', relatedSession.client_reference_id);
                        }

                        if (companyIdFromSession) {
                            console.log("   ✔️  Encontrado companyId:", companyIdFromSession);

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

                            // Salvar o stripeCustomerId na tabela Company
                            const stripeCustomerId = typeof sub.customer === 'string' 
                                ? sub.customer 
                                : sub.customer.id;
                            
                            console.log("   • Customer ID para salvar:", stripeCustomerId);
                            
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
                            console.log("   ✔️  company.planId atualizado para", plan.id);
                            console.log("   ✔️  company.stripeCustomerId atualizado para", stripeCustomerId);

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

                            console.log("   ✔️  Assinatura criada com sucesso:", newSubscription.id);
                            return res.json({ received: true });
                        } else {
                            console.log("   ⚠️  Não foi possível encontrar a sessão relacionada à assinatura");
                            return res.json({ received: true });
                        }
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

                    // Salvar o stripeCustomerId na tabela Company
                    const stripeCustomerId = typeof sub.customer === 'string' 
                        ? sub.customer 
                        : sub.customer.id;
                    
                    console.log("   • Customer ID para salvar:", stripeCustomerId);
                    
                    // Buscar o plano baseado no priceId
                    const priceId = sub.items.data[0].price.id;
                    const plan = await prisma.plan.findFirst({
                        where: { stripePriceId: priceId },
                    });
                    
                    if (!plan) {
                        console.log("   ⚠️  Nenhum plano encontrado com o price.id:", priceId);
                        // Ainda assim, vamos atualizar o stripeCustomerId
                        await prisma.company.update({
                            where: { id: companyId },
                            data: { stripeCustomerId }
                        });
                        console.log("   ✔️  company.stripeCustomerId atualizado para", stripeCustomerId);
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
                    console.log("   ✔️  company.planId atualizado para", plan.id);
                    console.log("   ✔️  company.stripeCustomerId atualizado para", stripeCustomerId);
                    
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
                    
                    console.log("   ✔️  Nova assinatura criada com sucesso:", newSubscription.id);
                }
            }

            /* ---------- SUBSCRIPTION DELETED ---------- */
            else if (event.type === "customer.subscription.deleted") {
                console.log("processando pagamento customer.subscription.deleted");
                const sub = event.data.object as Stripe.Subscription;

                console.log("🔔  subscription.deleted recebido:");
                console.log("   • Stripe subscription ID:", sub.id);
                console.log("   • Status:", sub.status);
                console.log("   • Cancelamento programado:", sub.cancel_at_period_end ? "Sim" : "Não");
                console.log("   • Cancelado em:", sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : "N/A");

                // Buscar a assinatura no banco de dados
                const localSubscription = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id }
                });

                if (!localSubscription) {
                    console.log("   ⚠️  Nenhuma assinatura local encontrada para este ID.");
                    return res.json({ received: true });
                }

                console.log("   • Assinatura local encontrada:", localSubscription.id);
                console.log("   • Já está marcada como cancelada:", localSubscription.stripeSubscriptionCanceled ? "Sim" : "Não");
                console.log("   • Já está marcada como inativa:", !localSubscription.isActive ? "Sim" : "Não");

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
                console.log("   ✅ Assinatura marcada como inativa e cancelada");

                // Nota: Mantemos o usuário no mesmo plano, apenas com assinatura inativa e cancelada
                // Isso permitirá que o front-end mostre a página "subscription expired/canceled"
            }

            /* ---------- PAYMENT INTENT SUCCEEDED (PAYMENT ELEMENT) ---------- */
            else if (event.type === "payment_intent.succeeded") {
                console.log("Processando payment_intent.succeeded (Payment Element - Conta Principal)");
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                
                console.log("Payment Intent succeeded recebido (Conta Principal):");
                console.log("   • PaymentIntent ID:", paymentIntent.id);
                console.log("   • Amount:", paymentIntent.amount_received);
                console.log("   • Currency:", paymentIntent.currency);
                console.log("   • Receipt URL:", (paymentIntent as any).receipt_url);
                console.log("   • PaymentIntent:", JSON.stringify(paymentIntent, null, 2));
                
                // Buscar PaymentIntentRecord no banco
                const paymentRecord = await prisma.paymentIntentRecord.findUnique({
                    where: { stripePaymentIntentId: paymentIntent.id },
                    include: {
                        invoice: {
                            include: {
                                project: {
                                    include: {
                                        client: {
                                            select: {
                                                id: true,
                                                name: true,
                                                email: true,
                                                phone: true
                                            }
                                        }
                                    }
                                },
                                company: {
                                    select: {
                                        id: true,
                                        name: true,
                                        avatar: true,
                                        email: true,
                                        phone: true
                                    }
                                }
                            }
                        }
                    }
                });
                
                if (paymentRecord && paymentRecord.invoice) {
                    console.log("PaymentRecord encontrado para invoice:", paymentRecord.invoice.id);
                    
                    // Buscar receipt_url do Charge associado ao PaymentIntent
                    let receiptUrl = null;
                    try {
                        if (paymentIntent.latest_charge) {
                            const chargeId = typeof paymentIntent.latest_charge === 'string' 
                                ? paymentIntent.latest_charge 
                                : paymentIntent.latest_charge.id;
                            
                            const charge = await stripe.charges.retrieve(chargeId);
                            receiptUrl = charge.receipt_url;
                            console.log("Receipt URL encontrado:", receiptUrl);
                        }
                    } catch (chargeError) {
                        console.error("Erro ao buscar charge para receipt URL:", chargeError);
                    }
                    
                    // Atualizar status do PaymentIntentRecord e salvar receipt URL
                    await prisma.paymentIntentRecord.update({
                        where: { stripePaymentIntentId: paymentIntent.id },
                        data: { 
                            status: "succeeded",
                            receiptUrl: receiptUrl,
                            updatedAt: new Date()
                        }
                    });
                    
                    // Atualizar status da Invoice para "paid"
                    await prisma.invoice.update({
                        where: { id: paymentRecord.invoice.id },
                        data: { 
                            status: "paid",
                            stripePaymentIntentId: paymentIntent.id
                        }
                    });
                    
                    console.log("Invoice atualizada como paga via Payment Element (Conta Principal)");
                    
                    // Registrar timeline
                    await prisma.invoiceTimeline.create({
                        data: {
                            description: `Payment completed via Payment Element - Amount: $${(paymentIntent.amount_received / 100).toFixed(2)}`,
                            invoiceId: paymentRecord.invoice.id
                        }
                    });
                    
                    // Enviar emails de confirmação (usando mesma lógica do WebHookControllerConnect)
                    try {
                        await this.sendPaymentConfirmationEmails(paymentRecord.invoice, paymentIntent);
                    } catch (emailError: any) {
                        console.error("Erro ao enviar emails de confirmação (Payment Element):", emailError.message);
                    }
                    
                } else {
                    console.log("PaymentIntentRecord não encontrado no banco de dados local");
                }
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

    /**
     * Enviar emails de confirmação de pagamento (Payment Element)
     */
    private async sendPaymentConfirmationEmails(invoiceData: any, paymentIntent: Stripe.PaymentIntent) {
        try {
            console.log("Iniciando envio de emails de confirmação de pagamento (Payment Element)");
            
            // Configurar SMTP
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false },
            });
            
            // Verificar se temos dados obrigatórios
            if (!invoiceData.company?.name) {
                console.error("Nome da empresa não encontrado, cancelando envio de emails");
                return;
            }
            
            // Formatar o valor
            const formattedAmount = `$${(paymentIntent.amount_received / 100).toFixed(2)}`;
            
            // Gerar código da invoice
            const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;
            
            // Lista de destinatários com templates específicos
            const recipients = [];
            
            // Email do cliente
            if (invoiceData.project?.client?.email && invoiceData.project?.client?.name) {
                // Obter logo da empresa
                const companyLogo = invoiceData.company?.avatar 
                    ? await getPresignedUrl(invoiceData.company.avatar) 
                    : '';
                
                const clientTemplate = invoicePaymentConfirmation(
                    invoiceData.project.client.name,
                    companyLogo,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.company.name,
                    invoiceData.company?.phone || undefined,
                    invoiceData.company?.email || undefined
                );
                
                recipients.push({
                    email: invoiceData.project.client.email,
                    name: invoiceData.project.client.name,
                    template: clientTemplate,
                    type: 'client'
                });
            }
            
            // Email da empresa
            if (invoiceData.company?.email) {
                const companyTemplate = invoicePaymentNotificationCompany(
                    invoiceData.company.name,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.project?.client?.name || 'Client',
                    invoiceData.project?.contract_number || undefined
                );
                
                recipients.push({
                    email: invoiceData.company.email,
                    name: invoiceData.company.name,
                    template: companyTemplate,
                    type: 'company'
                });
            }
            
            console.log(`Enviando para ${recipients.length} destinatários:`, recipients.map(r => `${r.email} (${r.type})`));
            
            // Enviar emails para cada destinatário
            for (const recipient of recipients) {
                try {
                    const mailOptions = {
                        from: SMTP_CONFIG.user,
                        to: recipient.email,
                        subject: recipient.type === 'company' 
                            ? `Payment Received - Invoice #${invoiceCode}` 
                            : `Payment Confirmation - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    };
                    
                    await transporter.sendMail(mailOptions);
                    console.log(`Email de ${recipient.type} enviado para ${recipient.email}`);
                    
                    // Log do envio de email
                    await prisma.invoiceEmailLog.create({
                        data: {
                            invoiceId: invoiceData.id,
                            recipient: recipient.email,
                            status: 'success'
                        }
                    });
                    
                } catch (emailError: any) {
                    console.error(`Erro ao enviar email de ${recipient.type} para ${recipient.email}:`, emailError.message);
                    
                    // Log do erro de envio
                    await prisma.invoiceEmailLog.create({
                        data: {
                            invoiceId: invoiceData.id,
                            recipient: recipient.email,
                            status: 'error',
                            errorMessage: emailError.message
                        }
                    });
                }
            }
            
        } catch (error: any) {
            console.error("[PaymentConfirmation] Erro geral ao enviar emails:", error.message);
            throw error;
        }
    }
}
