import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import Stripe from "stripe";
import { stripeConfig } from "../../config/stripe";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const stripe = stripeConfig.getClient();

// Configurações de surcharge (taxa de cartão)
const SURCHARGE_CONFIG = {
    percentage: 0.029, // 2.9%
    cardMethods: ['card', 'apple_pay', 'google_pay', 'link'] // métodos que aplicam surcharge
};

export class PaymentElementController {

    /**
     * Calcula o surcharge baseado no método de pagamento
     * Para cartão: adiciona 2.9% do valor original (sem taxa fixa)
     */
    private calculateSurcharge(amount: number, paymentMethodType?: string): number {
        if (!paymentMethodType || !SURCHARGE_CONFIG.cardMethods.includes(paymentMethodType)) {
            return 0;
        }

        // Só 2.9% (sem taxa fixa $0.30) 
        return amount * SURCHARGE_CONFIG.percentage;
    }

    /**
     * Inicia o processo de pagamento via Payment Element
     * Cria um PaymentIntent e retorna o client_secret
     */
    startPayment = async (req: Request, res: Response) => {
        const { invoiceId } = req.params;

        try {
            console.log("Iniciando Payment Element para invoice:", invoiceId);

            // Buscar invoice com relacionamentos
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    project: {
                        include: {
                            client: true,
                            company: true
                        }
                    },
                    InvoiceItems: true
                }
            });

            if (invoice && invoice.status === 'void'){
                return res.status(400).json({
                    error: "Invoice is void"
                });
            }

            if (!invoice || !invoice.project || !invoice.project.company || !invoice.project.client) {
                return res.status(404).json({
                    error: "Invoice, project, company, or client not found"
                });
            }

            const company = invoice.project.company;
            const client = invoice.project.client;

            if (!company.stripeAccountId) {
                return res.status(400).json({
                    error: "Company not connected to Stripe"
                });
            }

            // Verificar se a invoice já foi paga - confirmar essa regra de negocio
            // if (invoice.status === 'paid') {
            //     return res.status(400).json({ 
            //         error: "Invoice already paid" 
            //     });
            // }

            // Verificar se já existe um PaymentIntent bem-sucedido para esta invoice
            const existingSuccessfulPayment = await prisma.paymentIntentRecord.findFirst({
                where: {
                    invoiceId: invoice.id,
                    status: 'succeeded'
                }
            });

            if (existingSuccessfulPayment) {
                return res.status(400).json({
                    error: "Payment already completed",
                    paymentIntentId: existingSuccessfulPayment.stripePaymentIntentId,
                    redirectToSuccess: true
                });
            }

            const stripeAccountId = company.stripeAccountId;
            console.log("Using Stripe Account:", stripeAccountId);

            // Garantir que existe um customer no Stripe (conta principal)
            let stripeCustomerId = client.stripeCustomerId;

            if (!stripeCustomerId) {
                console.log("Creating new Stripe customer on connected account...");
                const customer = await stripe.customers.create({
                    name: client.name,
                    email: client.email,
                    phone: client.phone ?? undefined,
                }, { stripeAccount: stripeAccountId }); // Criando na conta conectada
                
                console.log('customer criado customer', customer);
                console.log('customer id', customer.id);
                stripeCustomerId = customer.id;

                await prisma.client.update({
                    where: { id: client.id },
                    data: { stripeCustomerId }
                });

                console.log("Customer created on connected account:", stripeCustomerId);
            }

            // Calcular valor base (sem surcharge)
            const baseAmount = Number(invoice.totalAmount);
            const currency = invoice.currency || 'usd';

            // Verificar se já existe um PaymentIntent ativo para esta invoice
            let existingPaymentIntent = await prisma.paymentIntentRecord.findFirst({
                where: {
                    invoiceId: invoice.id,
                    status: { in: ['requires_payment_method', 'requires_confirmation', 'succeeded'] }
                },
                orderBy: { createdAt: 'desc' }
            });

            let paymentIntent: Stripe.PaymentIntent;
            let paymentIntentRecord;

            if (existingPaymentIntent) {
                // Usar PaymentIntent existente
                console.log("Using existing PaymentIntent:", existingPaymentIntent.stripePaymentIntentId);

                paymentIntent = await stripe.paymentIntents.retrieve(
                    existingPaymentIntent.stripePaymentIntentId,
                    { stripeAccount: stripeAccountId } // Recuperando da conta conectada
                );

                paymentIntentRecord = existingPaymentIntent;
            } else {
                // Criar novo PaymentIntent (sem surcharge inicialmente)
                console.log("Creating new PaymentIntent...");

                // DIRECT CHARGE: Criar PaymentIntent na CONTA CONECTADA
                // Responsabilidade por chargebacks/refunds fica com a conta conectada
                const platformFee = baseAmount * 0.029; // Taxa da plataforma (2.9%)
                
                paymentIntent = await stripe.paymentIntents.create({
                    amount: Math.round(baseAmount * 100), // em centavos (sem surcharge inicial)
                    currency: currency,
                    customer: stripeCustomerId,
                    automatic_payment_methods: {
                        enabled: true,
                    },
                    // application_fee_amount: Math.round(platformFee * 100), // Taxa da plataforma
                    metadata: {
                        invoiceId: invoice.id,
                        companyId: company.id,
                        projectId: invoice.projectId
                    }
                }, { stripeAccount: stripeAccountId }); // CRIADO NA CONTA CONECTADA

                console.log("PaymentIntent created:", paymentIntent.id);

                // Salvar no banco
                paymentIntentRecord = await prisma.paymentIntentRecord.create({
                    data: {
                        stripePaymentIntentId: paymentIntent.id,
                        status: paymentIntent.status,
                        amount: baseAmount,
                        surchargeAmount: 0,
                        currency: currency,
                        stripeAccountId: stripeAccountId,
                        customerId: stripeCustomerId,
                        invoiceId: invoice.id
                    }
                });

                console.log("PaymentIntentRecord created:", paymentIntentRecord.id);
            }

            // Preparar breakdown dos valores
            const amountBreakdown = {
                subtotal: baseAmount,
                surcharge: 0,
                total: baseAmount,
                currency: currency
            };

            return res.status(200).json({
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                stripeAccountId: stripeAccountId, // Para usar no frontend
                amountBreakdown,
                companyName: company.name,
                invoiceNumber: invoice.externalInvoiceId || invoice.id
            });

        } catch (error) {
            console.error("Erro ao iniciar Payment Element:", error);
            return res.status(500).json({
                error: "Internal Server Error"
            });
        }
    }

    /**
     * Recalcula o valor do PaymentIntent baseado no método de pagamento selecionado
     */
    recalculatePayment = async (req: Request, res: Response) => {
        const { paymentIntentId, methodType } = req.body;

        try {
            console.log("Recalculando pagamento para:", { paymentIntentId, methodType });

            // Buscar o PaymentIntentRecord
            const paymentRecord = await prisma.paymentIntentRecord.findUnique({
                where: { stripePaymentIntentId: paymentIntentId },
                include: {
                    invoice: {
                        include: {
                            project: {
                                include: {
                                    company: true
                                }
                            }
                        }
                    }
                }
            });

            if (!paymentRecord || !paymentRecord.invoice?.project?.company) {
                return res.status(404).json({
                    error: "PaymentIntent not found"
                });
            }

            // Verificar se o PaymentIntent já foi pago
            if (paymentRecord.status === 'succeeded') {
                return res.status(400).json({
                    error: "Payment already completed",
                    paymentIntentId: paymentIntentId,
                    redirectToSuccess: true
                });
            }

            const stripeAccountId = paymentRecord.stripeAccountId;
            const baseAmount = Number(paymentRecord.invoice.totalAmount);

            // Calcular surcharge baseado no método
            const surcharge = this.calculateSurcharge(baseAmount, methodType); 
            const newTotal = baseAmount + surcharge;

            console.log("Cálculo de valores:", {
                baseAmount,
                methodType,
                surcharge,
                newTotal
            });

            // Atualizar PaymentIntent no Stripe (conta conectada)
            const updatedPaymentIntent = await stripe.paymentIntents.update(
                paymentIntentId,
                {
                    amount: Math.round(newTotal * 100) // em centavos
                },
                { stripeAccount: stripeAccountId } // Atualizando na conta conectada
            );

            // Atualizar registro no banco
            await prisma.paymentIntentRecord.update({
                where: { stripePaymentIntentId: paymentIntentId },
                data: {
                    amount: newTotal,
                    surchargeAmount: surcharge,
                    paymentMethodType: methodType,
                    status: updatedPaymentIntent.status
                }
            });

            console.log("PaymentIntent atualizado com sucesso");

            return res.status(200).json({
                ok: true,
                newAmount: newTotal,
                surcharge: surcharge,
                baseAmount: baseAmount,
                methodType: methodType
            });

        } catch (error) {
            console.error("Erro ao recalcular pagamento:", error);
            return res.status(500).json({
                error: "Internal Server Error"
            });
        }
    }

    /**
     * Obtém o status atual de um PaymentIntent
     */
    getPaymentStatus = async (req: Request, res: Response) => {
        const { paymentIntentId } = req.params;

        try {
            const paymentRecord = await prisma.paymentIntentRecord.findUnique({
                where: { stripePaymentIntentId: paymentIntentId },
                include: {
                    invoice: {
                        include: {
                            project: {
                                include: {
                                    client: true,
                                    company: true
                                }
                            }
                        }
                    }
                }
            });

            if (!paymentRecord) {
                return res.status(404).json({
                    error: "PaymentIntent not found"
                });
            }

            // Buscar status atualizado no Stripe (conta conectada)
            const paymentIntent = await stripe.paymentIntents.retrieve(
                paymentIntentId,
                { stripeAccount: paymentRecord.stripeAccountId } // Buscando da conta conectada
            );


            // Buscar receipt URL se não estiver salvo e pagamento foi bem-sucedido
            let receiptUrl = paymentRecord.receiptUrl;
            if (!receiptUrl && paymentIntent.status === 'succeeded' && paymentIntent.latest_charge) {
                try {
                    const chargeId = typeof paymentIntent.latest_charge === 'string' 
                        ? paymentIntent.latest_charge 
                        : paymentIntent.latest_charge.id;
                    
                    const charge = await stripe.charges.retrieve(chargeId, { stripeAccount: paymentRecord.stripeAccountId });
                    receiptUrl = charge.receipt_url;
                    console.log("Receipt URL obtido do charge:", receiptUrl);
                } catch (chargeError) {
                    console.error("Erro ao buscar charge para receipt URL:", chargeError);
                }
            }

            // Atualizar status no banco se necessário
            if (paymentRecord.status !== paymentIntent.status || (!paymentRecord.receiptUrl && receiptUrl)) {
                await prisma.paymentIntentRecord.update({
                    where: { stripePaymentIntentId: paymentIntentId },
                    data: { 
                        status: paymentIntent.status,
                        receiptUrl: receiptUrl
                    }
                });
            }

            return res.status(200).json({
                paymentIntentId: paymentIntent.id,
                status: paymentIntent.status,
                amount: paymentRecord.amount,
                surchargeAmount: paymentRecord.surchargeAmount,
                currency: paymentRecord.currency,
                paymentMethodType: paymentRecord.paymentMethodType,
                receiptUrl: receiptUrl || paymentRecord.receiptUrl, // URL do recibo atualizado
                invoice: {
                    id: paymentRecord.invoice.id,
                    externalInvoiceId: paymentRecord.invoice.externalInvoiceId,
                    status: paymentRecord.invoice.status,
                    company: paymentRecord.invoice.project?.company?.name,
                    client: paymentRecord.invoice.project?.client?.name
                }
            });

        } catch (error) {
            console.error("Erro ao obter status do pagamento:", error);
            return res.status(500).json({
                error: "Internal Server Error"
            });
        }
    }

    /**
     * Lista os PaymentIntents de uma invoice (para histórico)
     */
    getInvoicePaymentIntents = async (req: Request, res: Response) => {
        const { invoiceId } = req.params;

        try {
            const paymentIntents = await prisma.paymentIntentRecord.findMany({
                where: { invoiceId },
                orderBy: { createdAt: 'desc' },
                include: {
                    invoice: {
                        select: {
                            id: true,
                            externalInvoiceId: true,
                            status: true,
                            totalAmount: true
                        }
                    }
                }
            });

            return res.status(200).json({
                paymentIntents
            });

        } catch (error) {
            console.error("Erro ao listar PaymentIntents:", error);
            return res.status(500).json({
                error: "Internal Server Error"
            });
        }
    }

    /**
     * Busca o PDF de uma invoice
     */
    getInvoicePdf = async (req: Request, res: Response) => {
        const { invoiceId } = req.params;

        try {
            console.log("Buscando PDF para invoice:", invoiceId);

            // Buscar invoice com PDFs relacionados
            const invoice = await prisma.invoice.findUnique({
                where: { id: invoiceId },
                include: {
                    PdfProject: true
                }
            });

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                });
            }

            // Verificar se existe PDF
            if (!invoice.PdfProject || invoice.PdfProject.length === 0) {
                return res.status(404).json({
                    error: "No PDF found for this invoice"
                });
            }

            // Pegar o primeiro PDF (assumindo que há apenas um por invoice)
            const pdf = invoice.PdfProject[0];

            if (!pdf.uri) {
                return res.status(404).json({
                    error: "PDF URI not found"
                });
            }

            // Gerar URL presigned para o PDF
            const pdfUrl = await getPresignedUrl(pdf.uri);

            console.log("PDF URL gerada com sucesso");

            return res.status(200).json({
                pdfUrl: pdfUrl,
                fileName: pdf.original_file_name || 'invoice.pdf'
            });

        } catch (error) {
            console.error("Erro ao buscar PDF da invoice:", error);
            return res.status(500).json({
                error: "Internal Server Error"
            });
        }
    }
}
