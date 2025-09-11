import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import nodemailer from "nodemailer";
import { invoicePaymentConfirmation } from "../../templateEmail/invoicePaymentConfirmation";
import { invoicePaymentNotificationCompany } from "../../templateEmail/invoicePaymentNotificationCompany";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const stripe = stripeConfig.getClient();

export class StripeWebHookControllerConnect {
    constructor() {
        this.handleConnectWebhook = this.handleConnectWebhook.bind(this);
        this.sendPaymentConfirmationEmails = this.sendPaymentConfirmationEmails.bind(this);
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
                            await this.sendPaymentConfirmationEmails(invoiceData, invoice);
                        } catch (emailError: any) {
                            console.error("Erro ao enviar emails de confirmação:", emailError.message);
                        }
                    } else {
                        console.log("Invoice não encontrada no banco de dados local");
                    }
                }
            }
             /* ---------- PAYMENT INTENT SUCCEEDED (PAYMENT ELEMENT) ---------- */
            //  se decidir que vou usar o payment intent na conta conectada o webhook deve ter esse comportamento
            //  if (event.type === "payment_intent.succeeded") {
            //     console.log("Processando payment_intent.succeeded (Payment Element)");
            //     const paymentIntent = event.data.object as Stripe.PaymentIntent;
                
            //     // Verificar se é um evento de conta conectada
            //     const stripeEvent = event as Stripe.Event & { account?: string };
                
            //     if (stripeEvent.account) {
            //         console.log("Payment Intent succeeded recebido (Conta Conectada):");
            //         console.log("   • PaymentIntent ID:", paymentIntent.id);
            //         console.log("   • Amount:", paymentIntent.amount_received);
            //         console.log("   • Currency:", paymentIntent.currency);
                    
            //         // Buscar PaymentIntentRecord no banco
            //         const paymentRecord = await prisma.paymentIntentRecord.findUnique({
            //             where: { stripePaymentIntentId: paymentIntent.id },
            //             include: {
            //                 invoice: {
            //                     include: {
            //                         project: {
            //                             include: {
            //                                 client: {
            //                                     select: {
            //                                         id: true,
            //                                         name: true,
            //                                         email: true,
            //                                         phone: true
            //                                     }
            //                                 }
            //                             }
            //                         },
            //                         company: {
            //                             select: {
            //                                 id: true,
            //                                 name: true,
            //                                 avatar: true,
            //                                 email: true,
            //                                 phone: true
            //                             }
            //                         }
            //                     }
            //                 }
            //             }
            //         });
                    
            //         if (paymentRecord && paymentRecord.invoice) {
            //             console.log("PaymentRecord encontrado para invoice:", paymentRecord.invoice.id);
                        
            //             // Atualizar status do PaymentIntentRecord
            //             await prisma.paymentIntentRecord.update({
            //                 where: { stripePaymentIntentId: paymentIntent.id },
            //                 data: { 
            //                     status: "succeeded",
            //                     updatedAt: new Date()
            //                 }
            //             });
                        
            //             // Atualizar status da Invoice para "paid"
            //             await prisma.invoice.update({
            //                 where: { id: paymentRecord.invoice.id },
            //                 data: { 
            //                     status: "paid",
            //                     stripePaymentIntentId: paymentIntent.id // Garantir que está vinculado
            //                 }
            //             });
                        
            //             console.log("Invoice atualizada como paga via Payment Element");
                        
            //             // Registrar timeline
            //             await prisma.invoiceTimeline.create({
            //                 data: {
            //                     description: `Payment completed via Payment Element - Amount: $${(paymentIntent.amount_received / 100).toFixed(2)}`,
            //                     invoiceId: paymentRecord.invoice.id
            //                 }
            //             });
                        
            //             // Enviar emails de confirmação (reutilizando a função existente)
            //             try {
            //                 // Criar objeto similar ao stripeInvoice para compatibilidade
            //                 const mockStripeInvoice = {
            //                     id: paymentIntent.id,
            //                     amount_paid: paymentIntent.amount_received,
            //                     number: paymentRecord.invoice.externalInvoiceId || paymentRecord.invoice.id
            //                 } as Stripe.Invoice;
                            
            //                 await this.sendPaymentConfirmationEmails(paymentRecord.invoice, mockStripeInvoice);
            //             } catch (emailError: any) {
            //                 console.error("Erro ao enviar emails de confirmação (Payment Element):", emailError.message);
            //             }
                        
            //         } else {
            //             console.log("PaymentIntentRecord não encontrado no banco de dados local");
            //         }
            //     }
            // }

            
            // Outros handlers de eventos conectados podem ser adicionados aqui

            return res.json({ received: true });
        } catch (err: any) {
            console.error("Connect webhook error:", err.message);
            return res.status(400).send(`Connect webhook error: ${err.message}`);
        }
    }
    
    private async sendPaymentConfirmationEmails(invoiceData: any, stripeInvoice: Stripe.Invoice) {
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
} 