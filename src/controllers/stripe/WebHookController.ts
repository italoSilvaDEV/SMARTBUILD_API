import { Request, Response } from 'express';
import Stripe from 'stripe';
import { stripeConfig } from "../../config/stripe";
import { prisma } from '../../utils/prisma';

const stripe = stripeConfig.getClient();

export class StripeWebHooksController {
    async handleWebhook(req: Request, res: Response) {
        const sig = req.headers['stripe-signature'];

        try {
            // Vamos primeiro recuperar todos os webhooks ativos
            const webhooks = await prisma.webhooks.findMany({
                where: { status: 'enabled' },
            });

            console.log('Webhooks ativos:', webhooks.map(w => w.event));

            // Tentar cada webhook até encontrar o correto
            let event: Stripe.Event | null = null;
            let webhook = null;

            for (const hook of webhooks) {
                try {
                    event = stripe.webhooks.constructEvent(
                        req.body,
                        sig as string,
                        hook.secret
                    );
                    webhook = hook;
                    console.log(`Evento verificado usando webhook para: ${hook.event}`);
                    break; // Encontramos o webhook correto!
                } catch (e) {
                    // Tente o próximo webhook
                    console.log(`Webhook para ${hook.event} não corresponde à assinatura`);
                }
            }

            if (!event || !webhook) {
                return res.status(400).send('Nenhum webhook válido encontrado para este evento');
            }

            console.log('Processando evento:', event.type);

            // Agora podemos processar o evento baseado no seu tipo
            if (event.type === 'invoice.payment_succeeded') {
                const invoice = event.data.object as Stripe.Invoice;
                console.log('Pagamento confirmado para a Invoice:', invoice.id);

                // Atualiza o status da fatura no banco
                await prisma.invoice.update({
                    where: { stripeInvoiceId: invoice.id },
                    data: { status: 'paid' },
                });
            }
            else if (event.type === 'checkout.session.completed') {
                const session = event.data.object as Stripe.Checkout.Session;
                console.log('Checkout concluído para a sessão:', session.id);

                // Verificar se é uma compra de plano
                if (session.mode === 'subscription' && session.metadata?.planId && session.metadata?.companyId) {
                    const {
                        planId,
                        companyId,
                        startDate,
                        endDate
                    } = session.metadata;

                    console.log(`Processando assinatura para empresa ${companyId}, plano ${planId}`);

                    // Buscar informações do plano
                    const plan = await prisma.plan.findUnique({
                        where: { id: planId }
                    });

                    if (!plan) {
                        console.error('Plano não encontrado:', planId);
                        return res.status(200).send('Evento recebido, mas plano não encontrado.');
                    }

                    // Atualizar a empresa com o novo plano
                    await prisma.company.update({
                        where: { id: companyId },
                        data: { planId }
                    });

                    // Verifique o tipo de session.subscription e acesse o ID de maneira segura
                    let stripeSubscriptionId: string | null = null;

                    if (typeof session.subscription === 'string') {
                        stripeSubscriptionId = session.subscription; // Se for uma string, é o ID da assinatura
                    } else if (session.subscription && 'id' in session.subscription) {
                        stripeSubscriptionId = session.subscription.id; // Se for um objeto, acessa o ID da assinatura
                    }

                    // Criar uma assinatura para a empresa usando as datas do metadata
                    const subscription = await prisma.subscription.create({
                        data: {
                            companyId,
                            planId,
                            startDate: new Date(startDate),
                            endDate: new Date(endDate),
                            isActive: true,
                            stripeSubscriptionId // Adicionando o ID da assinatura do Stripe
                        }
                    });

                    console.log(`Assinatura do plano ${plan.name} ativada para empresa ${companyId}`);
                }
            }

            res.status(200).send('Evento recebido e processado com sucesso!');
        } catch (error: any) {
            console.error('Erro ao processar o webhook:', error.message);
            res.status(400).send(`Webhook Error: ${error.message}`);
        }
    };
}
