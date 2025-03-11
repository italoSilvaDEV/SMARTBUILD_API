import { stripeConfig } from "./stripe";
import { prisma } from '../utils/prisma';

const stripe = stripeConfig.getClient();

export async function setupWebhook() {
    const webhookUrl = `${process.env.URL_API}/webhook`;

    try {
        const existingWebhook = await prisma.webhooks.findFirst({
            where: { event: 'invoice.payment_succeeded', status: 'enabled' },
        });

        if (existingWebhook) {
            console.log('Webhook já configurado:', existingWebhook.id);
            return;
        }

        const webhook = await stripe.webhookEndpoints.create({
            url: webhookUrl,
            enabled_events: ['invoice.payment_succeeded'],
            connect: true,
        });

        await prisma.webhooks.create({
            data: {
                name: 'Webhook de Pagamento de Invoice',
                event: 'invoice.payment_succeeded',
                secret: webhook.secret || '',
                url: webhook.url,
                status: 'enabled',
                stripeId: webhook.id,
            },
        });

        console.log('Webhook criado com sucesso:', webhook.id);
    } catch (error) {
        console.error('Erro ao configurar o webhook:', error);
    }
}
