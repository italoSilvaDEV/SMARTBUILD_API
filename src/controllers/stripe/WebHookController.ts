import { Request, Response } from "express";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { prisma } from "../../utils/prisma";

const stripe = stripeConfig.getClient();

/** Só aplicar mudança de plano/permissões quando o pagamento foi confirmado (evita aplicar em cartão recusado, etc.). */
function isSubscriptionPaid(status: string): boolean {
    return status === "active" || status === "trialing";
}

/**
 * Syncs permissions for all non-Worker offices when the company's plan changes.
 *
* - ADICIONAR permissões novas no novo plano (que não existiam no plano antigo) a cada office.
* - REMOVER permissões que não existem mais no novo plano de cada office.
* - PRESERVAR as escolhas personalizadas por office: se um office tinha uma permissão anteriormente
* negada (estava no plano antigo, mas não atribuída ao office), ela permanece negada.
* - O office Worker nunca recebe permissões.
 */
async function syncAllOfficePermissionsOnPlanChange(
    companyId: string,
    oldPlanId: string | null,
    newPlanId: string
): Promise<void> {
    // No real plan change (e.g. card update, billing update) — do not touch permissions
    if (oldPlanId === newPlanId) {
        console.log("     Plan unchanged (same planId), skipping permission sync.");
        return;
    }

    // Load new plan permissions
    const newPlan = await prisma.plan.findUnique({
        where: { id: newPlanId },
        include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } }
    });
    if (!newPlan?.permissionGroup?.GroupPermissionsList?.length) return;
    const newPlanPermIds = new Set(newPlan.permissionGroup.GroupPermissionsList.map((r) => r.permission_id));

    // Load old plan permissions (may be null for brand new companies)
    let oldPlanPermIds = new Set<string>();
    if (oldPlanId && oldPlanId !== newPlanId) {
        const oldPlan = await prisma.plan.findUnique({
            where: { id: oldPlanId },
            include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } }
        });
        if (oldPlan?.permissionGroup?.GroupPermissionsList) {
            oldPlanPermIds = new Set(oldPlan.permissionGroup.GroupPermissionsList.map((r) => r.permission_id));
        }
    }

    // Diff between plans
    const addedPermIds = [...newPlanPermIds].filter((id) => !oldPlanPermIds.has(id));
    const removedPermIds = [...oldPlanPermIds].filter((id) => !newPlanPermIds.has(id));

    // console.log(`     Plan diff → +${addedPermIds.length} new permissions, -${removedPermIds.length} removed permissions`);

    // Load all offices for this company, excluding Worker
    const offices = await prisma.office.findMany({
        where: { company_id: companyId, name: { not: "Worker" } },
        include: { userPermissions: { select: { permission_id: true } } }
    });

    for (const office of offices) {
        const existingPermIds = new Set(office.userPermissions.map((up) => up.permission_id));

        // Only add permissions the office doesn't already have
        const toAdd = addedPermIds.filter((id) => !existingPermIds.has(id));
        // Only remove permissions the office currently has
        const toRemove = removedPermIds.filter((id) => existingPermIds.has(id));

        if (toAdd.length > 0) {
            await prisma.userPermission.createMany({
                data: toAdd.map((permission_id) => ({
                    office_id: office.id,
                    permission_id,
                    editAll: false
                }))
            });
        }

        if (toRemove.length > 0) {
            await prisma.userPermission.deleteMany({
                where: { office_id: office.id, permission_id: { in: toRemove } }
            });
        }

        // console.log(`     Office "${office.name}": +${toAdd.length} added, -${toRemove.length} removed (existing: ${existingPermIds.size})`);
    }
    // console.log(`     Permissions synced for ${offices.length} office(s) on plan "${newPlan.name}"`);
}

/** Cria Office Worker (sem permissões) e Office Administrator (igual ao plano) somente quando eles não existem — para o fluxo de inscrição de novas empresas.*/
async function ensureWorkerAndAdministratorOfficesForNewCompany(companyId: string, planId: string): Promise<void> {
    const existing = await prisma.office.findMany({
        where: { company_id: companyId, name: { in: ["Worker", "Administrator"] } },
        select: { name: true }
    });
    const hasWorker = existing.some((o) => o.name === "Worker");
    const hasAdmin = existing.some((o) => o.name === "Administrator");
    if (hasWorker && hasAdmin) return;

    const plan = await prisma.plan.findUnique({
        where: { id: planId },
        include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } }
    });
    const permissionIds = plan?.permissionGroup?.GroupPermissionsList?.map((r) => r.permission_id) ?? [];

    if (!hasWorker) {
        await prisma.office.create({ data: { name: "Worker", company_id: companyId } });
        // console.log("     Worker office created (new company flow).");
    }
    if (!hasAdmin) {
        const adminOffice = await prisma.office.create({
            data: { name: "Administrator", company_id: companyId }
        });
        if (permissionIds.length > 0) {
            await prisma.userPermission.createMany({
                data: permissionIds.map((permission_id) => ({
                    office_id: adminOffice.id,
                    permission_id,
                    editAll: false
                }))
            });
        }
        // console.log("     Administrator office created with plan permissions (new company flow).");
    }
}

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

            console.log("Processing event:", event.type);
          
            if (event.type === "invoice.payment_succeeded") {
                console.log("Processando pagamento invoice.payment_succeeded (Conta Principal)");
                const invoice = event.data.object as Stripe.Invoice;
                
                // console.log(" Invoice payment succeeded recebido (Conta Principal):");
                // console.log("    Invoice ID:", invoice.id);
                // console.log("    Subscription:", invoice.subscription);
                
                if (invoice.subscription) {
                    const subscription = await prisma.subscription.findFirst({
                        where: { 
                            stripeSubscriptionId: typeof invoice.subscription === 'string' 
                                ? invoice.subscription 
                                : invoice.subscription.id
                        }
                    });
                    
                    if (subscription) {
                        await prisma.subscription.update({
                            where: { id: subscription.id },
                            data: { paymentFailed: false, stripeStatus: 'active' }
                        });
                    }
                }
            }

            /* ---------- CHECKOUT COMPLETED ---------- */
            else if (event.type === "checkout.session.completed") {
                console.log("processando pagamento checkout.session.completed");
                const session = event.data.object as Stripe.Checkout.Session;

                if (session.mode === "subscription") {
                    //  Sistema interno usa metadata
                    const { planId, companyId, referralId } = session.metadata || {};
                    
                    // Log separado: Rewardful usa client_reference_id
                    if (session.client_reference_id) {
                        console.log(' [Rewardful] Referral ID detectado:', session.client_reference_id);
                    }
                    
                    //  Log separado: Sistema interno usa metadata  
                    if (referralId && referralId !== session.client_reference_id) {
                        console.log(' [Backup] Referral ID também encontrado nos metadados:', referralId);
                    }

                    if (companyId && planId) {
                        console.log(" Checkout completado para companyId:", companyId, "planId:", planId);
                        // Não atualizar company.planId aqui: o plano e as permissões só são aplicados quando a
                        // assinatura estiver paga (subscription.created ou subscription.updated com status active/trialing).
                        // Assim, em caso de cartão recusado e retry, subscription.updated (active) verá o plano
                        // antigo na company e aplicará corretamente o diff de permissões.
                        const stripeSubscriptionId = typeof session.subscription === "string"
                            ? session.subscription
                            : session.subscription?.id;
                        console.log("Nova assinatura Stripe ID:", stripeSubscriptionId);
                    }
                }
            }

            /* ---------- SUBSCRIPTION UPDATED ---------- */
            else if (event.type === "customer.subscription.updated") {
                console.log("processando pagamento customer.subscription.updated")
                const sub = event.data.object as Stripe.Subscription;

                // console.log("  subscription.updated recebido:");
                // console.log("    Stripe subscription ID:", sub.id);
                // console.log("    Status:", sub.status);
                // console.log("   current_period_end (unix):", sub.current_period_end);
                // console.log("   canceled_at (unix):", sub.canceled_at || "não cancelada");

                // Busca assinatura local pelo ID do Stripe
                let localSub = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id },
                });

                // Assinatura pode não existir localmente se subscription.created veio com status "incomplete" (ex.: cartão recusado) e não criamos registro
                if (!localSub) {
                    console.log("    Nenhuma assinatura local encontrada para este ID.");
                    if (isSubscriptionPaid(sub.status) && sub.metadata?.companyId) {
                        const companyIdFromMeta = sub.metadata.companyId as string;
                        console.log("    Assinatura paga sem registro local (provável retry após falha). Aplicando plano e permissões.");
                        const priceId = sub.items.data[0].price.id;
                        const plan = await prisma.plan.findFirst({ where: { stripePriceId: priceId } });
                        if (plan) {
                            const companyBefore = await prisma.company.findUnique({
                                where: { id: companyIdFromMeta },
                                select: { planId: true }
                            });
                            const oldPlanId = companyBefore?.planId ?? null;
                            const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
                            await prisma.company.update({
                                where: { id: companyIdFromMeta },
                                data: { planId: plan.id, stripeCustomerId, allowedEmployees: plan.allowedEmployees }
                            });
                            await prisma.subscription.updateMany({
                                where: { companyId: companyIdFromMeta, isActive: true },
                                data: { isActive: false }
                            });
                            const newSub = await prisma.subscription.create({
                                data: {
                                    companyId: companyIdFromMeta,
                                    planId: plan.id,
                                    startDate: new Date(sub.current_period_start * 1000),
                                    endDate: new Date(sub.current_period_end * 1000),
                                    isActive: true,
                                    stripeSubscriptionId: sub.id,
                                    stripeSubscriptionCanceled: false,
                                    paymentFailed: false,
                                    stripeDateSubscriptionCanceled: null,
                                    stripeStatus: sub.status,
                                    ...(sub.status === 'trialing' && sub.trial_end && {
                                        trialEndDate: new Date(sub.trial_end * 1000)
                                    })
                                }
                            });
                            await ensureWorkerAndAdministratorOfficesForNewCompany(companyIdFromMeta, plan.id);
                            await syncAllOfficePermissionsOnPlanChange(companyIdFromMeta, oldPlanId, plan.id);
                            console.log("    Assinatura local criada e plano aplicado:", newSub.id);
                        }
                    }
                    return res.json({ received: true });
                }

                // console.log("   • Assinatura local encontrada:", localSub.id);

                const newEnd = new Date(sub.current_period_end * 1000);
                
                // Verificar tipo de cancelamento
                if (sub.status === 'canceled') {
                    console.log("    Assinatura cancelada imediatamente detectada!");
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: { 
                            isActive: false,
                            stripeSubscriptionCanceled: true,
                            stripeDateSubscriptionCanceled: new Date(),
                            stripeStatus: 'canceled',
                            cancelRequested: false
                        }
                    });
                    console.log("    Assinatura marcada como inativa e cancelada imediatamente");
                    return res.json({ received: true });
                } 
                else if (sub.cancel_at_period_end) {
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: {
                            endDate: newEnd,
                            isActive: true,
                            stripeSubscriptionCanceled: false,
                            stripeDateSubscriptionCanceled: newEnd,
                            stripeStatus: sub.status,
                            ...(sub.status === 'trialing' && sub.trial_end && {
                                trialEndDate: new Date(sub.trial_end * 1000)
                            })
                        }
                    });
                    console.log("    Assinatura permanecerá ativa até o final do período");
                }
                else {
                    const isActive = sub.status === "active" || sub.status === "trialing";
                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: {
                            endDate: newEnd,
                            isActive,
                            stripeStatus: sub.status,
                            ...(isActive && { stripeDateSubscriptionCanceled: null }),
                            ...(sub.status === 'trialing' && sub.trial_end && {
                                trialEndDate: new Date(sub.trial_end * 1000)
                            }),
                            ...(sub.status === 'active' && {
                                trialEndDate: null
                            })
                        }
                    });
                    console.log("    Assinatura local atualizada.");
                }

                // Só aplicar mudança de plano/permissões quando a assinatura está paga (active/trialing)
                const price = sub.items.data[0].price as Stripe.Price;

                console.log("esse é o price", JSON.stringify(price, null, 2));

                let plan = await prisma.plan.findFirst({
                    where: { stripePriceId: price.id },
                });

                if (!plan && price.metadata && typeof price.metadata.planId === "string") {
                    plan = await prisma.plan.findUnique({
                        where: { id: price.metadata.planId },
                    });
                }

                if (plan && isSubscriptionPaid(sub.status)) {
                    console.log("   • Novo plano detectado:", plan.name, "(", plan.id, ")");

                    // Buscar o plano atual da empresa ANTES de atualizar (necessário para o diff de permissões)
                    const companyBeforeUpdate = await prisma.company.findUnique({
                        where: { id: localSub.companyId },
                        select: { planId: true, allowedEmployees: true }
                    });
                    const oldPlanId = companyBeforeUpdate?.planId ?? null;

                    // console.log("esse é oallowedEmployeesFromPlan", plan.allowedEmployees);

                    // Atualizar a empresa com o novo plano e allowedEmployees
                    await prisma.company.update({
                        where: { id: localSub.companyId },
                        data: { 
                            planId: plan.id,
                            allowedEmployees: plan.allowedEmployees
                        },
                    });

                    await prisma.subscription.update({
                        where: { id: localSub.id },
                        data: { planId: plan.id },
                    });
                    console.log("     Assinatura local atualizada.");
                    console.log("     company.planId atualizado para", plan.id);

                    // Sincroniza permissões de todos os offices (exceto Worker) respeitando customizações por office
                    await syncAllOfficePermissionsOnPlanChange(localSub.companyId, oldPlanId, plan.id);
                } else if (plan && !isSubscriptionPaid(sub.status)) {
                    console.log("     Assinatura não paga (status:", sub.status, "). Não atualizar plano nem permissões.");
                } else if (!plan) {
                    console.log("    Nenhum plano correspondente ao price.id", price.id);
                }
            }

            /* ---------- SUBSCRIPTION CREATED ---------- */
            else if (event.type === "customer.subscription.created") {
                console.log("processando pagamento customer.subscription.created");
                const sub = event.data.object as Stripe.Subscription;

                // console.log("  subscription.created recebido:");
                // console.log("    Stripe subscription ID:", sub.id);
                // console.log("    Status:", sub.status);
                // console.log("    current_period_end (unix):", sub.current_period_end);
                // console.log("   Customer ID:", sub.customer);

                // Verificar se temos o companyId na metadata
                const { companyId } = sub.metadata;

                if (!companyId) {
                    console.log("     Nenhum companyId encontrado na metadata, verificando por checkout.session.completed");
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
                        console.log("     Encontrada sessão de checkout relacionada:", relatedSession.id);

                        //  Sistema interno usa metadata
                        const companyIdFromSession = relatedSession.metadata?.companyId;
                        
                        //  Log do Rewardful se existir
                        if (relatedSession.client_reference_id) {
                            console.log(' [Rewardful] Referral ID na sessão:', relatedSession.client_reference_id);
                        }

                        if (companyIdFromSession) {
                            console.log("     Encontrado companyId:", companyIdFromSession);

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
                                console.log("     Nenhum plano encontrado com o price.id:", priceId);
                                return res.json({ received: true });
                            }

                            if (!isSubscriptionPaid(sub.status)) {
                                console.log("     Assinatura não paga (status:", sub.status, "). Não atualizar plano nem permissões. Aguardando pagamento ou subscription.updated.");
                                return res.json({ received: true });
                            }

                            console.log("    Novo plano detectado:", plan.name, "(", plan.id, ")");

                            // Salvar o stripeCustomerId na tabela Company
                            const stripeCustomerId = typeof sub.customer === 'string' 
                                ? sub.customer 
                                : sub.customer.id;
                            
                            console.log("   Customer ID para salvar:", stripeCustomerId);
                            
                            // Capturar o planId atual antes de atualizar (para o diff de permissões)
                            const companyBeforeSession = await prisma.company.findUnique({
                                where: { id: companyIdFromSession },
                                select: { planId: true }
                            });
                            const oldPlanIdFromSession = companyBeforeSession?.planId ?? null;

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
                            console.log("     company.planId atualizado para", plan.id);
                            // console.log("     company.stripeCustomerId atualizado para", stripeCustomerId);

                            // Criar assinatura no banco
                            const newSubscription = await prisma.subscription.create({
                                data: {
                                    companyId: companyIdFromSession,
                                    planId: plan.id,
                                    startDate: new Date(sub.current_period_start * 1000),
                                    endDate: new Date(sub.current_period_end * 1000),
                                    isActive: true,
                                    stripeSubscriptionId: sub.id,
                                    stripeSubscriptionCanceled: false,
                                    paymentFailed: false,
                                    stripeDateSubscriptionCanceled: null,
                                    stripeStatus: sub.status,
                                    ...(sub.status === 'trialing' && sub.trial_end && {
                                        trialEndDate: new Date(sub.trial_end * 1000)
                                    })
                                }
                            });

                            console.log("     Assinatura criada com sucesso:", newSubscription.id);
                            await ensureWorkerAndAdministratorOfficesForNewCompany(companyIdFromSession, plan.id);
                            await syncAllOfficePermissionsOnPlanChange(companyIdFromSession, oldPlanIdFromSession, plan.id);
                            return res.json({ received: true });
                        } else {
                            console.log("     Não foi possível encontrar a sessão relacionada à assinatura");
                            return res.json({ received: true });
                        }
                    } else {
                        console.log("     Não foi possível encontrar a sessão relacionada à assinatura");
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
                        console.log(" Assinatura já existe no banco:", existingSubscription.id);
                        return res.json({ received: true });
                    }

                    if (!isSubscriptionPaid(sub.status)) {
                        console.log(" Assinatura não paga (status:", sub.status, "). Não atualizar plano nem permissões.");
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
                    // console.log(" Assinaturas anteriores (incluindo planos FREE) marcadas como inativas");

                    // Salvar o stripeCustomerId na tabela Company
                    const stripeCustomerId = typeof sub.customer === 'string' 
                        ? sub.customer 
                        : sub.customer.id;
                    
                    // console.log("   • Customer ID para salvar:", stripeCustomerId);
                    
                    // Buscar o plano baseado no priceId
                    const priceId = sub.items.data[0].price.id;
                    const plan = await prisma.plan.findFirst({
                        where: { stripePriceId: priceId },
                    });
                    
                    if (!plan) {
                        console.log("     Nenhum plano encontrado com o price.id:", priceId);
                        // Ainda assim, vamos atualizar o stripeCustomerId
                        await prisma.company.update({
                            where: { id: companyId },
                            data: { stripeCustomerId }
                        });
                        console.log("     company.stripeCustomerId atualizado para", stripeCustomerId);
                        return res.json({ received: true });
                    }
                    
                    // Capturar o planId atual antes de atualizar (para o diff de permissões)
                    const companyBeforeCreate = await prisma.company.findUnique({
                        where: { id: companyId },
                        select: { planId: true }
                    });
                    const oldPlanIdBeforeCreate = companyBeforeCreate?.planId ?? null;

                    // Atualizar o plano e o stripeCustomerId da empresa
                    await prisma.company.update({
                        where: { id: companyId },
                        data: { 
                            planId: plan.id,
                            stripeCustomerId,
                            allowedEmployees: plan.allowedEmployees
                        }
                    });
                    // console.log("     company.planId atualizado para", plan.id);
                    // console.log("     company.stripeCustomerId atualizado para", stripeCustomerId);
                    
                    // Criar a nova assinatura local
                    const newSubscription = await prisma.subscription.create({
                        data: {
                            companyId,
                            planId: plan.id,
                            startDate: new Date(sub.current_period_start * 1000),
                            endDate: new Date(sub.current_period_end * 1000),
                            isActive: true,
                            stripeSubscriptionId: sub.id,
                            stripeSubscriptionCanceled: false,
                            paymentFailed: false,
                            stripeDateSubscriptionCanceled: null,
                            stripeStatus: sub.status,
                            ...(sub.status === 'trialing' && sub.trial_end && {
                                trialEndDate: new Date(sub.trial_end * 1000)
                            })
                        }
                    });
                    
                    console.log("    Nova assinatura criada com sucesso:", newSubscription.id);
                    await ensureWorkerAndAdministratorOfficesForNewCompany(companyId, plan.id);
                    await syncAllOfficePermissionsOnPlanChange(companyId, oldPlanIdBeforeCreate, plan.id);
                }
            }

            /* ---------- SUBSCRIPTION DELETED ---------- */
            else if (event.type === "customer.subscription.deleted") {
                console.log("processando pagamento customer.subscription.deleted");
                const sub = event.data.object as Stripe.Subscription;

                // console.log("  subscription.deleted recebido:");
                // console.log("    Stripe subscription ID:", sub.id);
                // console.log("   Status:", sub.status);
                // console.log("    Cancelamento programado:", sub.cancel_at_period_end ? "Sim" : "Não");
                // console.log("    Cancelado em:", sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : "N/A");

                // Buscar a assinatura no banco de dados
                const localSubscription = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id }
                });

                if (!localSubscription) {
                    console.log("     Nenhuma assinatura local encontrada para este ID.");
                    return res.json({ received: true });
                }

                // console.log("   • Assinatura local encontrada:", localSubscription.id);
                // console.log("   • Já está marcada como cancelada:", localSubscription.stripeSubscriptionCanceled ? "Sim" : "Não");
                // console.log("   • Já está marcada como inativa:", !localSubscription.isActive ? "Sim" : "Não");

                // Este evento ocorre quando:
                // 1. Assinatura foi cancelada imediatamente (não no fim do período)
                // 2. Assinatura com cancelamento no fim do período chegou ao final
                
                // Em ambos os casos, devemos marcar como inativa e cancelada.
                // Este evento é a FONTE DE VERDADE para isActive=false após cancelamento.
                await prisma.subscription.update({
                    where: { id: localSubscription.id },
                    data: { 
                        isActive: false,
                        stripeSubscriptionCanceled: true,
                        stripeStatus: 'canceled',
                        cancelRequested: false
                    }
                });
                console.log("    Assinatura marcada como inativa e cancelada");

                // Nota: Mantemos o usuário no mesmo plano, apenas com assinatura inativa e cancelada
                // Isso permitirá que o front-end mostre a página "subscription expired/canceled"
            }


            /* ---------- TRIAL WILL END (3 days before) ---------- */
            else if (event.type === "customer.subscription.trial_will_end") {
                const sub = event.data.object as Stripe.Subscription;
                console.log("customer.subscription.trial_will_end recebido para subscription:", sub.id);
                // Registrar log — base para futuros emails de aviso personalizados.
                // O Stripe já envia email automático ao cliente 7 dias antes.
                const localSub = await prisma.subscription.findFirst({
                    where: { stripeSubscriptionId: sub.id }
                });
                if (localSub) {
                    console.log("    Trial termina em breve para assinatura local:", localSub.id);
                }
            }

            /* ---------- INVOICE PAYMENT FAILED ---------- */
            else if (event.type === "invoice.payment_failed") {
                console.log("processando evento invoice.payment_failed");
                const invoice = event.data.object as Stripe.Invoice;

                console.log(" Invoice payment failed recebido:");
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
                            data: { paymentFailed: true, stripeStatus: 'past_due' }
                        });

                        console.log("    Assinatura marcada com pagamento falho");
                    } else {
                        console.log("    Nenhuma assinatura local encontrada para este ID");
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
