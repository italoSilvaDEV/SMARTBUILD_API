import Stripe from "stripe";

export const STRIPE_API_VERSION = "2025-02-24.acacia" as const;

export const stripeConfig = {
    getClient: () => new Stripe(process.env.STRIPE_SECRET_KEY as string, {
        apiVersion: STRIPE_API_VERSION,
    })
};