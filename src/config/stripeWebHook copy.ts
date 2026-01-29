import { stripeConfig } from "./stripe";
import { prisma } from '../utils/prisma';

const stripe = stripeConfig.getClient();

export async function setupWebhook() {
    const webhookUrl = `${process.env.URL_API}/webhook`;

    try {
        const existingInvoiceWebhook = await prisma.webhooks.findFirst({
            where: { event: 'invoice.payment_succeeded', status: 'enabled' },
        });

        if (!existingInvoiceWebhook) {
            const invoiceWebhook = await stripe.webhookEndpoints.create({
                url: webhookUrl,
                enabled_events: ['invoice.payment_succeeded'],
                connect: true,
            });

            await prisma.webhooks.create({
                data: {
                    name: 'Webhook de Pagamento de Invoice',
                    event: 'invoice.payment_succeeded',
                    secret: invoiceWebhook.secret || '',
                    url: invoiceWebhook.url,
                    status: 'enabled',
                    stripeId: invoiceWebhook.id,
                },
            });

        } else {
        }

        const existingCheckoutWebhook = await prisma.webhooks.findFirst({
            where: { event: 'checkout.session.completed', status: 'enabled' },
        });

        if (!existingCheckoutWebhook) {
            const checkoutWebhook = await stripe.webhookEndpoints.create({
                url: webhookUrl,
                enabled_events: ['checkout.session.completed'],
            });

            await prisma.webhooks.create({
                data: {
                    name: 'Webhook de Checkout Concluído',
                    event: 'checkout.session.completed',
                    secret: checkoutWebhook.secret || '',
                    url: checkoutWebhook.url,
                    status: 'enabled',
                    stripeId: checkoutWebhook.id,
                },
            });

        } else {
        }
    } catch (error) {
    }
}
