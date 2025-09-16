import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import nodemailer from "nodemailer";
import { invoicePaymentConfirmation } from "../../templateEmail/invoicePaymentConfirmation";
import { invoicePaymentNotificationCompany } from "../../templateEmail/invoicePaymentNotificationCompany";
import { invoicePaymentProcessing } from "../../templateEmail/invoicePaymentProcessing";
import { invoicePaymentProcessingCompany } from "../../templateEmail/invoicePaymentProcessingCompany";
import { invoicePaymentFailed } from "../../templateEmail/invoicePaymentFailed";
import { invoicePaymentFailedCompany } from "../../templateEmail/invoicePaymentFailedCompany";
import { invoicePaymentDisputedCompany } from "../../templateEmail/invoicePaymentDisputedCompany";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const stripe = stripeConfig.getClient();

export class StripeWebHookControllerConnect {
    constructor() {
        this.handleConnectWebhook = this.handleConnectWebhook.bind(this);
        this.sendInvoicePaymentConfirmationEmails = this.sendInvoicePaymentConfirmationEmails.bind(this);
        this.sendPaymentConfirmationEmails = this.sendPaymentConfirmationEmails.bind(this);
        this.sendPaymentProcessingEmails = this.sendPaymentProcessingEmails.bind(this);
        this.sendPaymentFailedEmails = this.sendPaymentFailedEmails.bind(this);
        this.sendPaymentDisputedEmails = this.sendPaymentDisputedEmails.bind(this);
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
                        where: { stripeInvoiceId: invoice.id },
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
                    });

                    if (invoiceData) {
                        // Atualizar status da fatura
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
                                        client: { select: { id: true, name: true, email: true, phone: true } }
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

                        // Enviar emails de notificação sobre processamento
                        try {
                            await this.sendPaymentProcessingEmails(pr.invoice, pi);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de processamento:", emailError.message);
                        }

                        // Se quiser um status específico na sua invoice:
                        // não faz sentido autalizar o invoice ela continuara em aberto pois o invoice sincroniza status com stripe
                        // await prisma.invoice.update({
                        //     where: { id: pr.invoice.id },
                        //     data: { status: "pending_settlement" } // crie esse enum/estado se ainda não existir
                        // });

                        // falta mandar email para o cliente e a companhia para avisar que o pagamento esta sendo processado

                        await prisma.invoiceTimeline.create({
                            data: {
                                description: `Payment is processing (possibly ACH settlement window). Amount: ${(pi.amount / 100).toFixed(2)} ${pi.currency?.toUpperCase()}`,
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
                    console.log("   • Receipt URL:", (paymentIntent as any).receipt_url);
                    console.log("   • PaymentIntent:", JSON.stringify(paymentIntent, null, 2));

                    // Buscar PaymentIntentRecord no banco
                    // const paymentRecord = await prisma.paymentIntentRecord.findUnique({
                    //     where: { stripePaymentIntentId: paymentIntent.id },
                    //     include: {
                    //         invoice: {
                    //             include: {
                    //                 project: {
                    //                     include: {
                    //                         client: {
                    //                             select: {
                    //                                 id: true,
                    //                                 name: true,
                    //                                 email: true,
                    //                                 phone: true
                    //                             }
                    //                         }
                    //                     }
                    //                 },
                    //                 company: {
                    //                     select: {
                    //                         id: true,
                    //                         name: true,
                    //                         avatar: true,
                    //                         email: true,
                    //                         phone: true
                    //                     }
                    //                 }
                    //             }
                    //         }
                    //     }
                    // });

                    const pr = await findByPI(paymentIntent.id);

                    if (pr && pr.invoice) {
                        console.log("pr encontrado para invoice:", pr.invoice.id);

                        // Buscar receipt_url do Charge associado ao PaymentIntent
                        let receiptUrl = null;
                        try {
                            if (paymentIntent.latest_charge) {
                                const chargeId = typeof paymentIntent.latest_charge === 'string'
                                    ? paymentIntent.latest_charge
                                    : paymentIntent.latest_charge.id;

                                const charge = await stripe.charges.retrieve(chargeId,
                                    { stripeAccount: pr.stripeAccountId }
                                    // ajuste para testar e ver 
                                );
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

                        // OBs verificar como fazer isso no stripe
                        // Atualizar status da Invoice para "paid" 
                        await prisma.invoice.update({
                            where: { id: pr.invoice.id },
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
                                invoiceId: pr.invoice.id
                            }
                        });

                        // Enviar emails de confirmação (usando mesma lógica do WebHookControllerConnect)
                        try {
                            await this.sendPaymentConfirmationEmails(pr.invoice, paymentIntent);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de confirmação (Payment Element):", emailError.message);
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

                        // Enviar emails de notificação sobre falha no pagamento
                        try {
                            await this.sendPaymentFailedEmails(pr.invoice, pi, failureMsg);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de falha no pagamento:", emailError.message);
                        }

                        // ainda vou ver como fazer com o invoice pois ele esta lincado com stripe
                        // Voltamos a invoice para “open” (ou “failed”, conforme seu domínio)
                        // await prisma.invoice.update({
                        //     where: { id: pr.invoice.id },
                        //     data: { status: "open" }
                        // });

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
                    // Muitas vezes dá pra chegar na PI por dispute.charge.payment_intent
                    let paymentIntentId: string | undefined;
                    try {
                        const ch = await stripe.charges.retrieve(
                            typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
                            // conectada – o webhook é “connect”, então use stripeAccount se você guardar
                            // aqui não temos fácil, então tratamos só com o paymentIntent se vier
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
                        const pr = await prisma.paymentIntentRecord.findUnique({
                            where: { stripePaymentIntentId: paymentIntentId },
                            include: { invoice: true }
                        });

                        if (pr?.invoice) {
                            await prisma.paymentIntentRecord.update({
                                where: { stripePaymentIntentId: paymentIntentId },
                                data: { status: "disputed", updatedAt: new Date() }
                            });

                            await prisma.invoice.update({
                                where: { id: pr.invoice.id },
                                data: { status: "returned" } // crie esse estado, se desejar diferenciar
                            });

                            await prisma.invoiceTimeline.create({
                                data: {
                                    description: `ACH return/dispute created. Reason: ${dispute.reason || "unknown"}`,
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

            // Configurar SMTP
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false },
            });

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

    /**
     * Enviar emails de notificação de processamento de pagamento
     */
    private async sendPaymentProcessingEmails(invoiceData: any, paymentIntent: Stripe.PaymentIntent) {
        try {
            console.log("Iniciando envio de emails de processamento de pagamento");

            // Configurar SMTP
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false },
            });

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
                    const mailOptions = {
                        from: SMTP_CONFIG.user,
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Payment Processing - Invoice #${invoiceCode}`
                            : `Payment Being Processed - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    };

                    await transporter.sendMail(mailOptions);
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

            // Configurar SMTP
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false },
            });

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
                    const mailOptions = {
                        from: SMTP_CONFIG.user,
                        to: recipient.email,
                        subject: recipient.type === 'company'
                            ? `Payment Failed - Invoice #${invoiceCode}`
                            : `Payment Failed - Invoice #${invoiceCode}`,
                        html: recipient.template,
                    };

                    await transporter.sendMail(mailOptions);
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

            // Configurar SMTP
            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: { user: SMTP_CONFIG.user, pass: SMTP_CONFIG.pass },
                tls: { rejectUnauthorized: false },
            });

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
                const mailOptions = {
                    from: SMTP_CONFIG.user,
                    to: invoiceData.company.email,
                    subject: ` URGENT: Payment Disputed - Invoice #${invoiceCode}`,
                    html: companyTemplate,
                };

                await transporter.sendMail(mailOptions);
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

}  