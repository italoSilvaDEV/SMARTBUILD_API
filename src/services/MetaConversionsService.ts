import axios from "axios";
import Stripe from "stripe";
import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { stripeConfig } from "../config/stripe";

const trackingValue = /^fb\.1\.\d+\.[A-Za-z0-9._-]+$/;
const maxDeliveryAttempts = 5;
const retryDelayMs = 5 * 60 * 1000;

export type MetaCheckoutAttribution = {
    fbp?: string;
    fbc?: string;
};

export function parseMetaCheckoutAttribution(value: unknown): MetaCheckoutAttribution | null {
    if (!value || typeof value !== "object") return null;
    const input = value as Record<string, unknown>;
    const fbp = typeof input.fbp === "string" && input.fbp.length <= 200 && trackingValue.test(input.fbp)
        ? input.fbp : undefined;
    const fbc = typeof input.fbc === "string" && input.fbc.length <= 300 && trackingValue.test(input.fbc)
        ? input.fbc : undefined;
    return fbp || fbc ? { ...(fbp && { fbp }), ...(fbc && { fbc }) } : null;
}

export function buildMetaPurchaseEvent(session: Stripe.Checkout.Session) {
    const metadata = session.metadata || {};
    if (session.mode !== "subscription" || session.payment_status !== "paid" || !session.amount_total) return null;
    const attribution = parseMetaCheckoutAttribution({ fbp: metadata.metaFbp, fbc: metadata.metaFbc });
    if (!attribution) return null;

    return {
        event_name: "Purchase",
        event_time: session.created,
        event_id: session.id,
        action_source: "website",
        event_source_url: `${(process.env.URL_FRONT || "https://app.prosmartbuild.com").replace(/\/$/, "")}/plans`,
        user_data: { ...(attribution.fbp && { fbp: attribution.fbp }), ...(attribution.fbc && { fbc: attribution.fbc }) },
        custom_data: {
            currency: (session.currency || "usd").toUpperCase(),
            value: session.amount_total / 100,
        },
    };
}

export async function sendMetaPurchaseFromCheckout(session: Stripe.Checkout.Session): Promise<boolean> {
    const event = buildMetaPurchaseEvent(session);
    const pixelId = process.env.META_PIXEL_ID;
    const token = process.env.META_CONVERSIONS_API_TOKEN;
    const version = process.env.META_GRAPH_API_VERSION;
    if (!event || !pixelId || !token || !version || !/^\d+$/.test(pixelId) || !/^v\d+\.\d+$/.test(version)) return false;

    try {
        await prisma.metaPurchaseDelivery.create({ data: { stripeSessionId: session.id, attemptCount: 1 } });
    } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
        const now = new Date();
        const reclaimed = await prisma.metaPurchaseDelivery.updateMany({
            where: {
                stripeSessionId: session.id,
                attemptCount: { lt: maxDeliveryAttempts },
                OR: [
                    { status: "FAILED", nextRetryAt: { lte: now } },
                    { status: "PENDING", claimedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } },
                ],
            },
            data: { status: "PENDING", claimedAt: now, nextRetryAt: null, attemptCount: { increment: 1 } },
        });
        if (reclaimed.count === 0) return false;
    }

    try {
        const response = await axios.post(
            `https://graph.facebook.com/${version}/${pixelId}/events`,
            {
                data: [event],
                ...(process.env.META_TEST_EVENT_CODE && { test_event_code: process.env.META_TEST_EVENT_CODE }),
            },
            { headers: { Authorization: `Bearer ${token}` }, timeout: 5000 },
        );
        if (response.data?.events_received !== 1) throw new Error("Meta did not accept the purchase event");
        await prisma.metaPurchaseDelivery.update({
            where: { stripeSessionId: session.id },
            data: { status: "SENT", sentAt: new Date(), nextRetryAt: null },
        });
        return true;
    } catch (error) {
        await prisma.metaPurchaseDelivery.update({
            where: { stripeSessionId: session.id },
            data: { status: "FAILED", nextRetryAt: new Date(Date.now() + retryDelayMs) },
        });
        throw error;
    }
}

export async function retryFailedMetaPurchases(): Promise<void> {
    if (!process.env.META_PIXEL_ID || !process.env.META_CONVERSIONS_API_TOKEN || !process.env.META_GRAPH_API_VERSION) return;

    const now = new Date();
    const deliveries = await prisma.metaPurchaseDelivery.findMany({
        where: {
            attemptCount: { lt: maxDeliveryAttempts },
            OR: [
                { status: "FAILED", nextRetryAt: { lte: now } },
                { status: "PENDING", claimedAt: { lt: new Date(now.getTime() - 10 * 60 * 1000) } },
            ],
        },
        orderBy: { claimedAt: "asc" },
        take: 20,
        select: { stripeSessionId: true },
    });

    const stripe = stripeConfig.getClient();
    for (const delivery of deliveries) {
        try {
            const session = await stripe.checkout.sessions.retrieve(delivery.stripeSessionId);
            await sendMetaPurchaseFromCheckout(session);
        } catch (error) {
            console.error("Meta purchase retry failed for checkout session:", delivery.stripeSessionId, error);
        }
    }
}
