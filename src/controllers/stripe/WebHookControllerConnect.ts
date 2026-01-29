import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { sendEmail } from "../../utils/sendEmail";
import { invoicePaymentConfirmation } from "../../templateEmail/invoicePaymentConfirmation";
import { invoicePaymentNotificationCompany } from "../../templateEmail/invoicePaymentNotificationCompany";
import { invoicePaymentProcessing } from "../../templateEmail/invoicePaymentProcessing";
import { invoicePaymentProcessingCompany } from "../../templateEmail/invoicePaymentProcessingCompany";
import { invoicePaymentFailed } from "../../templateEmail/invoicePaymentFailed";
import { invoicePaymentFailedCompany } from "../../templateEmail/invoicePaymentFailedCompany";
import { invoicePaymentDisputedCompany } from "../../templateEmail/invoicePaymentDisputedCompany";
import { invoicePaymentRequiresAction } from "../../templateEmail/invoicePaymentRequiresAction";
import { invoicePaymentRequiresActionCompany } from "../../templateEmail/invoicePaymentRequiresActionCompany";
import { invoicePaidPaymentEmail } from "../../templateEmail/invoicePaidPayment";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const stripe = stripeConfig.getClient();

// ========= Helpers para capturar Charge + Fees reais (com retry) =========
type FeeBreakdown = {
    currency: string;
    gross: number;        // amount (unidades monetárias)
    feeTotal: number;     // fee total (Stripe + app fee, se houver)
    stripeFee: number;    // apenas a parte stripe_fee
    applicationFee: number; // apenas a parte application_fee (se houver)
    net: number;          // net recebido pela conta conectada
    receiptUrl: string | null;
};

async function wait(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

/**
 * Busca o Charge e a BalanceTransaction (conta conectada) e extrai as taxas reais.
 * Faz tentativas, pois a BT pode não estar pronta no exato instante do webhook.
 */
async function fetchChargeAndFeesWithRetry(opts: {
    stripe: Stripe;
    stripeAccountId: string;
    paymentIntent: Stripe.PaymentIntent;
    maxTries?: number;
    delayMs?: number;
}): Promise<FeeBreakdown | null> {
    const { stripe, stripeAccountId, paymentIntent, maxTries = 6, delayMs = 2000 } = opts;

    const chargeId =
        typeof paymentIntent.latest_charge === "string"
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id;

    if (!chargeId) return null;

    let lastError: any = null;

    for (let attempt = 1; attempt <= maxTries; attempt++) {
        try {
            const charge = await stripe.charges.retrieve(chargeId, { stripeAccount: stripeAccountId });
            const receiptUrl = charge.receipt_url ?? null;

            const btId =
                typeof charge.balance_transaction === "string"
                    ? charge.balance_transaction
                    : charge.balance_transaction?.id;

            let bt: Stripe.BalanceTransaction | null = null;

            if (btId) {
                bt = await stripe.balanceTransactions.retrieve(btId, { stripeAccount: stripeAccountId });
            } else {
                const list = await stripe.balanceTransactions.list(
                    { source: chargeId, limit: 1 },
                    { stripeAccount: stripeAccountId }
                );
                bt = list.data[0] ?? null;
            }

            if (!bt) throw new Error("Balance transaction ainda não disponível");

            const currency = (bt.currency || paymentIntent.currency || "usd").toUpperCase();
            const gross = bt.amount / 100;
            const feeTotal = bt.fee / 100;
            const net = bt.net / 100;

            let stripeFee = 0;
            let applicationFee = 0;

            for (const fd of bt.fee_details || []) {
                const amount = (fd.amount || 0) / 100;
                if (fd.type === "stripe_fee") stripeFee += amount;
                if (fd.type === "application_fee") applicationFee += amount;
            }

            return { currency, gross, feeTotal, stripeFee, applicationFee, net, receiptUrl };
        } catch (err) {
            lastError = err;
            await wait(delayMs);
        }
    }

    console.error("Não foi possível obter BalanceTransaction após retries:", lastError?.message || lastError);
    return null;
}


export class StripeWebHookControllerConnect {
    constructor() {
        this.handleConnectWebhook = this.handleConnectWebhook.bind(this);
        this.sendInvoicePaymentConfirmationEmails = this.sendInvoicePaymentConfirmationEmails.bind(this);
        this.sendPaymentConfirmationEmails = this.sendPaymentConfirmationEmails.bind(this);
        this.sendPaymentProcessingEmails = this.sendPaymentProcessingEmails.bind(this);
        this.sendPaymentFailedEmails = this.sendPaymentFailedEmails.bind(this);
        this.sendPaymentDisputedEmails = this.sendPaymentDisputedEmails.bind(this);
        this.sendPaymentRequiresActionEmails = this.sendPaymentRequiresActionEmails.bind(this);
    }


    async handleConnectWebhook(req: Request, res: Response) {
        const sig = req.headers["stripe-signature"];

        try {
            // Buscar apenas webhooks de contas conectadas
            const webhooks = await prisma.webhooks.findMany({
                where: {
                    status: "enabled",
                    // isConnectWebhook: true
                }
            });

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

            console.log("Processing connect event:", event.type);

            /* ---------- INVOICE PAYMENT SUCCEEDED (CONNECT) ---------- */
            if (event.type === "invoice.payment_succeeded") {
                console.log("Processando pagamento invoice.payment_succeeded (Conta Conectada)");
                console.log("E esse amigo");
                const invoice = event.data.object as Stripe.Invoice;

                // Verificamos que deve ser um evento de conta conectada
                const stripeEvent = event as Stripe.Event & { account?: string };

                if (stripeEvent.account) {
                    console.log(" Invoice payment succeeded recebido (Conta Conectada):");
                    // console.log("   • Conta Conectada:", stripeEvent.account);

                    // Buscar dados completos da invoice com relacionamentos
                    const invoiceData = await prisma.invoice.findFirst({
                        where: {
                            stripeInvoiceId: invoice.id
                        },
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
                            estimate: {
                                select: {
                                    id: true,
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
                    });

                    if (invoiceData) {
                        await prisma.invoice.updateMany({
                            where: { stripeInvoiceId: invoice.id },
                            data: { status: "paid" },
                        });

                        console.log("Fatura de conta conectada atualizada como paga");

                        // Enviar emails de confirmação
                        try {
                            await this.sendInvoicePaymentConfirmationEmails(invoiceData, invoice);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de confirmação:", emailError.message);
                        }
                    } else {
                        console.log("Invoice não encontrada no banco de dados local");
                    }
                }
            }

            // Helper para achar seu registro + invoice pela PI
            const findByPI = async (paymentIntentId: string) => {
                return prisma.paymentIntentRecord.findUnique({
                    where: { stripePaymentIntentId: paymentIntentId },
                    include: {
                        invoice: {
                            include: {
                                project: {
                                    include: {
                                        client: { select: { id: true, name: true, email: true, phone: true } },
                                        workContext: { select: { id: true, Email: true, Name: true } }
                                    }
                                },
                                estimate: { 
                                    include: {
                                        project: {
                                            include: {
                                                client: { select: { id: true, name: true, email: true, phone: true } },
                                                workContext: { select: { id: true, Email: true, Name: true } }
                                            }
                                        }
                                    }
                                },
                                company: { select: { id: true, name: true, avatar: true, email: true, phone: true } }
                            }
                        }
                    }
                });
            };

            /* ---------- PAYMENT INTENT SUCCEEDED (PAYMENT ELEMENT) ---------- */
            switch (event.type) {

                /* ------------------- ACH (e outros) em compensação ------------------- */
                case "payment_intent.processing": {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    const pr = await findByPI(pi.id);
                    if (pr?.invoice) {
                        await prisma.paymentIntentRecord.update({
                            where: { stripePaymentIntentId: pi.id },
                            data: { status: "processing", updatedAt: new Date() }
                        });

                        // NOVO: Invoice mantém status "open" enquanto payment está processing
                        // O status do payment é acompanhado pelo PaymentIntentRecord
                        // await prisma.invoice.update({
                        //     where: { id: pr.invoice.id },
                        //     data: { status: "open" } // Mantém open até confirmar o pagamento
                        // });

                        // Enviar emails de notificação sobre processamento
                        try {
                            await this.sendPaymentProcessingEmails(pr.invoice, pi);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de processamento:", emailError.message);
                        }

                        await prisma.invoiceTimeline.create({
                            data: {
                                description: `Payment is processing (ACH settlement window). Amount: ${(pi.amount / 100).toFixed(2)} ${pi.currency?.toUpperCase()}`,
                                invoiceId: pr.invoice.id
                            }
                        });
                    }
                    break;
                }

                /* ------------------- Ação necessária (verificação de microdeposits) ------------------- */
                case "payment_intent.requires_action": {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    const pr = await findByPI(pi.id);
                    
                    if (pr?.invoice) {
                        console.log("Payment requires action (microdeposit verification):", pi.id);
                        
                        // Atualizar status do PaymentIntentRecord
                        await prisma.paymentIntentRecord.update({
                            where: { stripePaymentIntentId: pi.id },
                            data: { status: "requires_action", updatedAt: new Date() }
                        });

                        // Extrair informações da verificação de microdeposits
                        const nextAction = pi.next_action;
                        let verificationUrl = '';
                        let arrivalDate = '';

                        if (nextAction?.type === 'verify_with_microdeposits' && nextAction.verify_with_microdeposits) {
                            verificationUrl = nextAction.verify_with_microdeposits.hosted_verification_url || '';
                            
                            // Converter arrival_date (timestamp) para data legível
                            if (nextAction.verify_with_microdeposits.arrival_date) {
                                const date = new Date(nextAction.verify_with_microdeposits.arrival_date * 1000);
                                arrivalDate = date.toLocaleDateString('en-US', { 
                                    month: 'long', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                });
                            }
                        }

                        console.log("Verification URL:", verificationUrl);
                        console.log("Arrival Date:", arrivalDate);

                        // Enviar emails de notificação sobre ação necessária
                        try {
                            await this.sendPaymentRequiresActionEmails(
                                pr.invoice, 
                                pi, 
                                verificationUrl,
                                arrivalDate
                            );
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de ação necessária:", emailError.message);
                        }

                        // Registrar na timeline
                        await prisma.invoiceTimeline.create({
                            data: {
                                description: `Payment requires customer action: Bank account verification needed (microdeposits). Amount: ${(pi.amount / 100).toFixed(2)} ${pi.currency?.toUpperCase()}`,
                                invoiceId: pr.invoice.id
                            }
                        });
                    }
                    break;
                }

                /* -------------------------- Pagamento concluído ----------------------- */

                case "payment_intent.succeeded": {
                    console.log("Processando payment_intent.succeeded (Payment Element)");
                    const paymentIntent = event.data.object as Stripe.PaymentIntent;

                    console.log("   • PaymentIntent ID:", paymentIntent.id);
                    console.log("   • Amount:", paymentIntent.amount_received);
                    console.log("   • Currency:", paymentIntent.currency);

                    const pr = await findByPI(paymentIntent.id);


                    // if (!pr || !pr.invoice) {
                    //   console.log("PaymentIntentRecord não encontrado no banco de dados local");
                    //   break;


                    if (pr && pr.invoice) {
                        console.log("pr encontrado para invoice:", pr.invoice.id);

                        // Busca fees reais + receipt_url na CONTA CONECTADA (com retry)
                        const feeInfo = await fetchChargeAndFeesWithRetry({
                            stripe,
                            stripeAccountId: pr.stripeAccountId,
                            paymentIntent,
                        });

                        const receiptUrl: string | null = feeInfo?.receiptUrl ?? null;

                        // Totais da sua aplicação
                        const originalAmount = Number(pr.invoice.totalAmount); // valor base da invoice (sem surcharge local)
                        const paidAmount = Number(pr.amount);                  // total ajustado no PI (com surcharge local se cartão)
                        const localSurcharge = paidAmount - originalAmount;

                        // Fees reais vindas da Stripe (se ainda não disponíveis, feeInfo será null e salvamos 0 — sem estimativa)
                        const stripeFeesReal = feeInfo?.feeTotal ?? 0;
                        const currency = feeInfo?.currency || paymentIntent.currency?.toUpperCase() || "USD";
                        const netToConnected = feeInfo?.net ?? (paidAmount - stripeFeesReal);

                        console.log("Resumo do pagamento:", {
                            originalAmount,
                            paidAmount,
                            localSurcharge,
                            stripeFeesReal,
                            netToConnected,
                            currency,
                        });

                        // Atualiza o registro do PaymentIntent
                        await prisma.paymentIntentRecord.update({
                            where: { stripePaymentIntentId: paymentIntent.id },
                            data: {
                                status: "succeeded",
                                receiptUrl,
                                updatedAt: new Date()
                            }
                        });

                        // Atualiza a Invoice com dados robustos do pagamento
                        await prisma.invoice.update({
                            where: { id: pr.invoice.id },
                            data: {
                                status: "paid",
                                checked: true,
                                stripePaymentIntentId: paymentIntent.id,
                                paymentMethodType: pr.paymentMethodType || null,
                                totalAmountPaid: paidAmount,            // total cobrado do cliente
                                surchargePaymentLocal: localSurcharge,  // taxa local aplicada (só quando método = card/link/apple/google)
                                surchargePaymentStripe: stripeFeesReal, //  taxa Stripe REAL (BT)
                            }
                        });

                        if (pr.invoice.type_invoicebase === "project" && pr.invoice.project) {
                            await prisma.invoicePaymentTimeLine.create({
                                data: {
                                    description: "Payment invoice #" + pr.invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: 'USD',
                                    }).format(Number(pr.invoice.totalAmount)) + " on " + pr.invoice.updatedAt.toLocaleDateString('en-US'),
                                    projectId: pr.invoice.project.id
                                }
                            })
                        } else if (pr.invoice.type_invoicebase === "estimate" && pr.invoice.estimate) {
                            await prisma.invoicePaymentTimeLine.create({
                                data: {
                                    description: "Payment invoice #" + pr.invoice.externalInvoiceId + " of " + new Intl.NumberFormat('en-US', {
                                        style: 'currency',
                                        currency: 'USD',
                                    }).format(Number(pr.invoice.totalAmount)) + " on " + pr.invoice.updatedAt.toLocaleDateString('en-US'),
                                    estimateId: pr.invoice.estimate.id
                                }
                            })
                        }

                        console.log("Invoice atualizada como paga via Payment Element");

                        // Timeline
                        await prisma.invoiceTimeline.create({
                            data: {
                                description: `Payment completed (PI ${paymentIntent.id}) • Paid: ${paidAmount.toFixed(2)} ${currency} • Local surcharge: ${localSurcharge.toFixed(2)} • Stripe fees: ${stripeFeesReal.toFixed(2)} • Net to connected: ${netToConnected.toFixed(2)}`,
                                invoiceId: pr.invoice.id
                            }
                        });

                        // Enviar emails de confirmação
                        try {
                            await this.sendPaymentConfirmationEmails(pr.invoice, paymentIntent);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de confirmação (Payment Element):", emailError.message);
                        }

                        // Enviar email com PDF de confirmação de pagamento (se existir)
                        try {
                            await this.sendPaymentConfirmationEmailWithPdf(pr.invoice, paymentIntent);
                        } catch (pdfEmailError: any) {
                            console.error("Erro ao enviar email com PDF de confirmação:", pdfEmailError.message);
                        }

                    } else {
                        console.log("PaymentIntentRecord não encontrado no banco de dados local");
                    }

                    break;
                }


                /* ------------------------------ Falhou -------------------------------- */
                case "payment_intent.payment_failed": {
                    const pi = event.data.object as Stripe.PaymentIntent;
                    const pr = await findByPI(pi.id);

                    if (pr?.invoice) {
                        const failureMsg =
                            (pi.last_payment_error?.message) ||
                            (pi.last_payment_error?.code) ||
                            "Payment failed";

                        await prisma.paymentIntentRecord.update({
                            where: { stripePaymentIntentId: pi.id },
                            data: { status: "payment_failed", updatedAt: new Date() }
                        });

                        // NOVO: Manter invoice como "open" quando pagamento falha
                        await prisma.invoice.update({
                            where: { id: pr.invoice.id },
                            data: { status: "open" } // Volta para open para permitir nova tentativa
                        });

                        // Enviar emails de notificação sobre falha no pagamento
                        try {
                            await this.sendPaymentFailedEmails(pr.invoice, pi, failureMsg);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de falha no pagamento:", emailError.message);
                        }

                        await prisma.invoiceTimeline.create({
                            data: {
                                description: `Payment failed: ${failureMsg}`,
                                invoiceId: pr.invoice.id
                            }
                        });
                    }
                    break;
                }

                /* --------- retorno bancário / disputa em ACH debit ---------- */
                case "charge.dispute.created": {
                    const dispute = event.data.object as Stripe.Dispute;
                    // Encontrar o PaymentIntent associado através do charge
                    let paymentIntentId: string | undefined;
                    let stripeAccountId: string | undefined;

                    try {
                        // Obter conta conectada do evento se disponível
                        const stripeEvent = event as Stripe.Event & { account?: string };
                        stripeAccountId = stripeEvent.account;

                        const ch = await stripe.charges.retrieve(
                            typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
                            stripeAccountId ? { stripeAccount: stripeAccountId } : {}
                        );

                        if (typeof ch.payment_intent === "string") {
                            paymentIntentId = ch.payment_intent;
                        } else if (ch.payment_intent?.id) {
                            paymentIntentId = ch.payment_intent.id;
                        }
                    } catch (e) {
                        console.error("Não foi possível recuperar o charge da disputa:", e);
                    }

                    if (paymentIntentId) {
                        const pr = await findByPI(paymentIntentId);

                        if (pr?.invoice) {
                            // Atualizar PaymentIntentRecord como disputed
                            await prisma.paymentIntentRecord.update({
                                where: { stripePaymentIntentId: paymentIntentId },
                                data: { status: "disputed", updatedAt: new Date() }
                            });

                            // NOVO: Atualizar Invoice como "disputed" ou "returned"
                            await prisma.invoice.update({
                                where: { id: pr.invoice.id },
                                data: {
                                    status: "disputed", // Criar este status se necessário
                                    // Limpar dados de pagamento já que foi disputado
                                    paymentMethodType: null,
                                    totalAmountPaid: null,
                                    surchargePaymentLocal: null,
                                    surchargePaymentStripe: null
                                }
                            });

                            await prisma.invoiceTimeline.create({
                                data: {
                                    description: `Payment disputed/returned. Reason: ${dispute.reason || "unknown"}. Amount: $${(dispute.amount / 100).toFixed(2)}`,
                                    invoiceId: pr.invoice.id
                                }
                            });

                            // Enviar emails de notificação sobre disputa (apenas para empresa)
                            try {
                                await this.sendPaymentDisputedEmails(pr.invoice, dispute.reason || "unknown");
                            } catch (emailError: any) {
                                console.error("Erro ao enviar emails de disputa:", emailError.message);
                            }
                        }
                    }
                    break;
                }

                /* --------- Disputa resolvida em favor da empresa ---------- */
                case "charge.dispute.closed": {
                    const dispute = event.data.object as Stripe.Dispute;

                    // Só processar se a disputa foi vencida pela empresa
                    if (dispute.status === "won") {
                        let paymentIntentId: string | undefined;
                        let stripeAccountId: string | undefined;

                        try {
                            const stripeEvent = event as Stripe.Event & { account?: string };
                            stripeAccountId = stripeEvent.account;

                            const ch = await stripe.charges.retrieve(
                                typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
                                stripeAccountId ? { stripeAccount: stripeAccountId } : {}
                            );

                            if (typeof ch.payment_intent === "string") {
                                paymentIntentId = ch.payment_intent;
                            } else if (ch.payment_intent?.id) {
                                paymentIntentId = ch.payment_intent.id;
                            }
                        } catch (e) {
                            console.error("Não foi possível recuperar o charge da disputa resolvida:", e);
                        }

                        if (paymentIntentId) {
                            const pr = await findByPI(paymentIntentId);

                            if (pr?.invoice) {
                                // Atualizar PaymentIntentRecord como succeeded novamente
                                await prisma.paymentIntentRecord.update({
                                    where: { stripePaymentIntentId: paymentIntentId },
                                    data: { status: "succeeded", updatedAt: new Date() }
                                });

                                // Recalcular taxas para restaurar dados corretos
                                const originalAmount = Number(pr.invoice.totalAmount);
                                const paidAmount = Number(pr.amount);
                                const localSurcharge = paidAmount - originalAmount;

                                // NOVO: Restaurar Invoice como "paid" já que a disputa foi vencida
                                await prisma.invoice.update({
                                    where: { id: pr.invoice.id },
                                    data: {
                                        status: "paid",
                                        // Restaurar dados de pagamento
                                        paymentMethodType: pr.paymentMethodType,
                                        totalAmountPaid: pr.amount,
                                        surchargePaymentLocal: localSurcharge,
                                        // Nota: surchargePaymentStripe não é restaurado pois não temos o dado salvo no PR
                                    }
                                });

                                await prisma.invoiceTimeline.create({
                                    data: {
                                        description: `Dispute resolved in favor of company. Payment restored. Amount: $${(dispute.amount / 100).toFixed(2)}`,
                                        invoiceId: pr.invoice.id
                                    }
                                });
                            }
                        }
                    }
                    break;
                }

                default: break;

            }

            return res.json({ received: true });
        } catch (err: any) {
            console.error("Connect webhook error:", err.message);
            return res.status(400).send(`Connect webhook error: ${err.message}`);
        }
    }

    private async sendInvoicePaymentConfirmationEmails(invoiceData: any, stripeInvoice: Stripe.Invoice) {
        try {
            console.log("Iniciando envio de emails de confirmação de pagamento");

            // Verificar se temos dados obrigatórios (nome da empresa é obrigatório)
            if (!invoiceData.company?.name) {
                console.error("Nome da empresa não encontrado, cancelando envio de emails");
                return;
            }

            // Formatar o valor
            const formattedAmount = stripeInvoice.amount_paid
                ? `$${(stripeInvoice.amount_paid / 100).toFixed(2)}`
                : invoiceData.totalAmount?.toString() || '$0.00';

            // Gerar código da invoice
            const invoiceCode = invoiceData.externalInvoiceId || stripeInvoice.number || invoiceData.id;

            // Lista de destinatários com templates específicos
            const recipients = [];

            // Email do cliente (template original com logo da empresa)
            if (invoiceData.project?.client?.email && invoiceData.project?.client?.name) {
                // Obter logo da empresa apenas para o cliente
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

            // Email da empresa (template específico sem logo)
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

            // Resultados do envio para cada email
            const results = [];

            // Enviar emails para cada destinatário
            for (const recipient of recipients) {
                try {
                    await sendEmail({
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Payment Received - Invoice #${invoiceCode}`
                            : `Payment Confirmation - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    });
                    console.log(`Email de ${recipient.type} enviado para ${recipient.email}`);

                    results.push({ email: recipient.email, type: recipient.type, status: "success" });

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

                    results.push({ email: recipient.email, type: recipient.type, status: "error", message: emailError.message });

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

            console.log("Resultado do envio de emails:", results);

        } catch (error: any) {
            console.error("[PaymentConfirmation] Erro geral ao enviar emails:", error.message);
            throw error; // Re-throw para que o erro seja capturado no método principal
        }
    }

    /**
   * Enviar emails de confirmação de pagamento (Payment Element)
   */
    private async sendPaymentConfirmationEmails(invoiceData: any, paymentIntent: Stripe.PaymentIntent) {
        try {
            console.log("Iniciando envio de emails de confirmação de pagamento (Payment Element)");

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

            // Email do cliente - usar work context se disponível, senão usar client.email
            const project = invoiceData.project || invoiceData.estimate?.project;
            const client = invoiceData.project?.client || invoiceData.estimate?.project?.client;
            const workContext = project?.workContext;

            // Usar email do work context se disponível, senão usar email do cliente
            const clientEmail = workContext?.Email || client?.email;
            const clientName = workContext?.Name || client?.name;

            if (clientEmail && clientName) {
                // Obter logo da empresa
                const companyLogo = invoiceData.company?.avatar
                    ? await getPresignedUrl(invoiceData.company.avatar)
                    : '';

                const clientTemplate = invoicePaymentConfirmation(
                    clientName,
                    companyLogo,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.company.name,
                    invoiceData.company?.phone || undefined,
                    invoiceData.company?.email || undefined
                );

                recipients.push({
                    email: clientEmail,
                    name: clientName,
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
                    await sendEmail({
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Payment Received - Invoice #${invoiceCode}`
                            : `Payment Confirmation - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    });
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

    /**
     * Enviar emails de notificação de processamento de pagamento
     */
    private async sendPaymentProcessingEmails(invoiceData: any, paymentIntent: Stripe.PaymentIntent) {
        try {
            console.log("Iniciando envio de emails de processamento de pagamento");

            if (!invoiceData.company?.name) {
                console.error("Nome da empresa não encontrado, cancelando envio de emails");
                return;
            }

            const formattedAmount = `$${(paymentIntent.amount / 100).toFixed(2)}`;
            const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;
            const recipients = [];

            // Email do cliente
            if (invoiceData.project?.client?.email && invoiceData.project?.client?.name) {
                const companyLogo = invoiceData.company?.avatar
                    ? await getPresignedUrl(invoiceData.company.avatar)
                    : '';

                const clientTemplate = invoicePaymentProcessing(
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
                const companyTemplate = invoicePaymentProcessingCompany(
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

            console.log(`Enviando emails de processamento para ${recipients.length} destinatários`);

            for (const recipient of recipients) {
                try {
                    await sendEmail({
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Payment Processing - Invoice #${invoiceCode}`
                            : `Payment Being Processed - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    });
                    console.log(`Email de processamento (${recipient.type}) enviado para ${recipient.email}`);

                    await prisma.invoiceEmailLog.create({
                        data: {
                            invoiceId: invoiceData.id,
                            recipient: recipient.email,
                            status: 'success'
                        }
                    });

                } catch (emailError: any) {
                    console.error(`Erro ao enviar email de processamento para ${recipient.email}:`, emailError.message);

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
            console.error("[PaymentProcessing] Erro geral ao enviar emails:", error.message);
            throw error;
        }
    }

    /**
     * Enviar emails de notificação de falha no pagamento
     */
    private async sendPaymentFailedEmails(invoiceData: any, paymentIntent: Stripe.PaymentIntent, failureReason: string) {
        try {
            console.log("Iniciando envio de emails de falha no pagamento");

            if (!invoiceData.company?.name) {
                console.error("Nome da empresa não encontrado, cancelando envio de emails");
                return;
            }

            const formattedAmount = `$${(paymentIntent.amount / 100).toFixed(2)}`;
            const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;
            const recipients = [];

            // Email do cliente
            if (invoiceData.project?.client?.email && invoiceData.project?.client?.name) {
                const companyLogo = invoiceData.company?.avatar
                    ? await getPresignedUrl(invoiceData.company.avatar)
                    : '';

                const clientTemplate = invoicePaymentFailed(
                    invoiceData.project.client.name,
                    companyLogo,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.company.name,
                    failureReason,
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
                const companyTemplate = invoicePaymentFailedCompany(
                    invoiceData.company.name,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.project?.client?.name || 'Client',
                    failureReason,
                    invoiceData.project?.contract_number || undefined
                );

                recipients.push({
                    email: invoiceData.company.email,
                    name: invoiceData.company.name,
                    template: companyTemplate,
                    type: 'company'
                });
            }

            console.log(`Enviando emails de falha para ${recipients.length} destinatários`);

            for (const recipient of recipients) {
                try {
                    await sendEmail({
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Payment Failed - Invoice #${invoiceCode}`
                            : `Payment Failed - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    });
                    console.log(`Email de falha (${recipient.type}) enviado para ${recipient.email}`);

                    await prisma.invoiceEmailLog.create({
                        data: {
                            invoiceId: invoiceData.id,
                            recipient: recipient.email,
                            status: 'success'
                        }
                    });

                } catch (emailError: any) {
                    console.error(`Erro ao enviar email de falha para ${recipient.email}:`, emailError.message);

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
            console.error("[PaymentFailed] Erro geral ao enviar emails:", error.message);
            throw error;
        }
    }

    /**
     * Enviar emails de notificação de disputa de pagamento (apenas para empresa)
     */
    private async sendPaymentDisputedEmails(invoiceData: any, disputeReason: string) {
        try {
            console.log("Iniciando envio de emails de disputa de pagamento");

            if (!invoiceData.company?.name || !invoiceData.company?.email) {
                console.error("Dados da empresa não encontrados, cancelando envio de emails");
                return;
            }

            const formattedAmount = invoiceData.totalAmount ? `$${invoiceData.totalAmount.toFixed(2)}` : '$0.00';
            const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;

            // Email apenas para a empresa (disputas são críticas e apenas empresa precisa saber)
            const companyTemplate = invoicePaymentDisputedCompany(
                invoiceData.company.name,
                invoiceCode,
                formattedAmount,
                invoiceData.project?.client?.name || 'Client',
                disputeReason,
                invoiceData.project?.contract_number || undefined
            );

            try {
                await sendEmail({
                    to: invoiceData.company.email,
                    subject: ` URGENT: Payment Disputed - Invoice #${invoiceCode}`,
                    html: companyTemplate,
                });
                console.log(`Email de disputa enviado para ${invoiceData.company.email}`);

                await prisma.invoiceEmailLog.create({
                    data: {
                        invoiceId: invoiceData.id,
                        recipient: invoiceData.company.email,
                        status: 'success'
                    }
                });

            } catch (emailError: any) {
                console.error(`Erro ao enviar email de disputa para ${invoiceData.company.email}:`, emailError.message);

                await prisma.invoiceEmailLog.create({
                    data: {
                        invoiceId: invoiceData.id,
                        recipient: invoiceData.company.email,
                        status: 'error',
                        errorMessage: emailError.message
                    }
                });
            }

        } catch (error: any) {
            console.error("[PaymentDisputed] Erro geral ao enviar emails:", error.message);
            throw error;
        }
    }

    /**
     * Enviar emails de notificação de ação necessária (verificação de microdeposits)
     */
    private async sendPaymentRequiresActionEmails(
        invoiceData: any, 
        paymentIntent: Stripe.PaymentIntent, 
        verificationUrl: string,
        arrivalDate: string
    ) {
        try {
            console.log("Iniciando envio de emails de ação necessária");

            if (!invoiceData.company?.name) {
                console.error("Nome da empresa não encontrado, cancelando envio de emails");
                return;
            }

            const formattedAmount = `$${(paymentIntent.amount / 100).toFixed(2)}`;
            const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;
            const recipients = [];

            // Email do cliente (com link de verificação)
            if (invoiceData.project?.client?.email && invoiceData.project?.client?.name) {
                const companyLogo = invoiceData.company?.avatar
                    ? await getPresignedUrl(invoiceData.company.avatar)
                    : '';

                const clientTemplate = invoicePaymentRequiresAction(
                    invoiceData.project.client.name,
                    companyLogo,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.company.name,
                    verificationUrl,
                    arrivalDate,
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

            // Email da empresa (notificação sobre ação necessária do cliente)
            if (invoiceData.company?.email) {
                const companyTemplate = invoicePaymentRequiresActionCompany(
                    invoiceData.company.name,
                    invoiceCode,
                    formattedAmount,
                    invoiceData.project?.client?.name || 'Client',
                    arrivalDate,
                    verificationUrl,
                    invoiceData.project?.contract_number || undefined
                );

                recipients.push({
                    email: invoiceData.company.email,
                    name: invoiceData.company.name,
                    template: companyTemplate,
                    type: 'company'
                });
            }

            console.log(`Enviando emails de ação necessária para ${recipients.length} destinatários`);

            for (const recipient of recipients) {
                try {
                    await sendEmail({
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Customer Action Required - Invoice #${invoiceCode}`
                            : `Action Required: Verify Your Bank Account - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    });
                    console.log(`Email de ação necessária (${recipient.type}) enviado para ${recipient.email}`);

                    await prisma.invoiceEmailLog.create({
                        data: {
                            invoiceId: invoiceData.id,
                            recipient: recipient.email,
                            status: 'success'
                        }
                    });

                } catch (emailError: any) {
                    console.error(`Erro ao enviar email de ação necessária para ${recipient.email}:`, emailError.message);

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
            console.error("[PaymentRequiresAction] Erro geral ao enviar emails:", error.message);
            throw error;
        }
    }

    /**
     * Enviar email com PDF de confirmação de pagamento (pdfInvoicePaid)
     */
    private async sendPaymentConfirmationEmailWithPdf(invoiceData: any, paymentIntent: Stripe.PaymentIntent) {
        try {
            console.log("Iniciando envio de email com PDF de confirmação de pagamento");

            // Obter projeto com workContext
            const project = invoiceData.project || invoiceData.estimate?.project;
            const client = invoiceData.project?.client || invoiceData.estimate?.project?.client;
            const company = invoiceData.company;
            const workContext = project?.workContext;

            // Usar email do work context se disponível, senão usar email do cliente
            const recipientEmail = workContext?.Email || client?.email;
            const recipientName = workContext?.Name || client?.name || 'Client';

            if (!recipientEmail) {
                console.log("Recipient email not found (neither work context nor client email), skipping email send");
                return;
            }

            // Buscar o PDF de invoice pago (opcional - pode não existir para invoices antigos)
            const pdfInvoicePaid = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    invoiceId: invoiceData.id
                }
            });

            const companyAvatar = company?.avatar
                ? await getPresignedUrl(company.avatar)
                : "";

            // Buscar o PDF do S3 (apenas se existir)
            const attachments = [];
            if (pdfInvoicePaid?.uri) {
                try {
                    const pdfUrl = await getPresignedUrl(pdfInvoicePaid.uri);
                    const pdfResponse = await fetch(pdfUrl);
                    if (pdfResponse.ok) {
                        const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                        const fileName = pdfInvoicePaid.original_file_name || `invoice_paid_${invoiceData.externalInvoiceId || invoiceData.id}.pdf`;
                        attachments.push({
                            filename: fileName,
                            content: pdfBuffer.toString('base64'),
                            type: 'application/pdf',
                            disposition: 'attachment'
                        });
                        console.log(`PDF paid anexado ao email: ${fileName}`);
                    }
                } catch (error) {
                    console.warn("Erro ao buscar PDF invoice paid, enviando email sem anexo:", error);
                    // Continua sem o PDF anexado
                }
            } else {
                console.log("PDF invoice paid não encontrado, enviando email sem anexo");
            }

            const paymentDate = new Date();
            const formattedAmount = `$${(paymentIntent.amount_received / 100).toFixed(2)}`;
            const invoiceCode = invoiceData.externalInvoiceId || invoiceData.id;
            const emailSubject = `Invoice #${invoiceCode} - Payment Confirmation`;

            const emailHtml = invoicePaidPaymentEmail(
                recipientName,
                companyAvatar || "",
                company?.name || '',
                invoiceCode,
                Number(paymentIntent.amount_received / 100),
                paymentDate.toISOString(),
                invoiceData.paymentMethodType || 'Payment',
                undefined,
                company?.phone || '',
                company?.email || ''
            );

            await sendEmail({
                to: recipientEmail,
                subject: emailSubject,
                html: emailHtml,
                attachments: attachments.length > 0 ? attachments : undefined,
                text: `
Dear ${recipientName},

We are pleased to confirm that Invoice #${invoiceCode} has been paid successfully.

Payment Details:
- Invoice Number: #${invoiceCode}
- Payment Amount: ${formattedAmount}
- Payment Date: ${paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
- Payment Method: ${invoiceData.paymentMethodType || 'Payment'}

Thank you for your prompt payment. If you have any questions, please feel free to contact us.

Have a great day!
${company?.name || ''}
                `.trim()
            });

            console.log(`Email com PDF enviado para ${recipientEmail}`);

            // Log do envio de email
            await prisma.invoiceEmailLog.create({
                data: {
                    invoiceId: invoiceData.id,
                    recipient: recipientEmail,
                    status: 'success'
                }
            });

        } catch (error: any) {
            console.error("[PaymentConfirmationWithPdf] Erro ao enviar email com PDF:", error.message);
            // Não fazer throw para não interromper o fluxo principal
        }
    }

}  