import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripeConfig } from "../../config/stripe";
import { prisma } from '../../utils/prisma';

const stripe = stripeConfig.getClient();

export class StripeWebHooksController {
    async handleWebhook(req: Request, res: Response) {
        const sig = req.headers['stripe-signature'];

        try {
            // Recupera o webhook ativo
            const webhook = await prisma.webhooks.findFirst({
                where: { event: 'invoice.payment_succeeded', status: 'enabled' },
            });

            if (!webhook || !webhook.secret) {
                return res.status(400).send('Webhook não configurado.');
            }

            // Verifica a assinatura do Stripe
            const event = stripe.webhooks.constructEvent(req.body, sig as string, webhook.secret);

            // Processa o evento
            if (event.type === 'invoice.payment_succeeded') {
                const invoice = event.data.object as Stripe.Invoice;

                console.log('Pagamento confirmado para a Invoice:', invoice.id);

                // Atualiza o status da fatura no banco
                await prisma.invoice.update({
                    where: { stripeInvoiceId: invoice.id },
                    data: { status: 'paid' },
                });
            }

            res.status(200).send('Evento recebido com sucesso!');
        } catch (error: any) {
            console.error('Erro ao processar o webhook:', error.message);
            res.status(400).send(`Webhook Error: ${error.message}`);
        }
    };

}
