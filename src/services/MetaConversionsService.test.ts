import axios from "axios";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import { prisma } from "../utils/prisma";
import { buildMetaPurchaseEvent, parseMetaCheckoutAttribution, sendMetaPurchaseFromCheckout } from "./MetaConversionsService";

jest.mock("../utils/prisma", () => ({
    prisma: {
        metaPurchaseDelivery: {
            create: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
        },
    },
}));

const session = (overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session => ({
    id: "cs_test_123",
    mode: "subscription",
    payment_status: "paid",
    amount_total: 2599,
    currency: "usd",
    created: 1760000000,
    metadata: { metaConsent: "granted", metaFbp: "fb.1.1760000000.123456789" },
    ...overrides,
} as Stripe.Checkout.Session);

describe("Meta checkout conversion", () => {
    it("accepts only consented, valid browser identifiers", () => {
        expect(parseMetaCheckoutAttribution({ consent: true, fbp: "fb.1.1760000000.123456789" }))
            .toEqual({ consent: true, fbp: "fb.1.1760000000.123456789" });
        expect(parseMetaCheckoutAttribution({ consent: false, fbp: "fb.1.1760000000.123456789" })).toBeNull();
        expect(parseMetaCheckoutAttribution({ consent: true, fbp: "invalid" })).toBeNull();
    });

    it("builds a paid purchase event without personal contact data", () => {
        expect(buildMetaPurchaseEvent(session())).toMatchObject({
            event_name: "Purchase",
            event_id: "cs_test_123",
            user_data: { fbp: "fb.1.1760000000.123456789" },
            custom_data: { currency: "USD", value: 25.99 },
        });
    });

    it("does not report unpaid, trial, or unconsented checkouts as purchases", () => {
        expect(buildMetaPurchaseEvent(session({ payment_status: "unpaid" }))).toBeNull();
        expect(buildMetaPurchaseEvent(session({ amount_total: 0 }))).toBeNull();
        expect(buildMetaPurchaseEvent(session({ metadata: {} }))).toBeNull();
    });

    it("does not call Meta when server credentials are absent", async () => {
        const prior = process.env.META_CONVERSIONS_API_TOKEN;
        delete process.env.META_CONVERSIONS_API_TOKEN;
        try {
            await expect(sendMetaPurchaseFromCheckout(session())).resolves.toBe(false);
        } finally {
            if (prior) process.env.META_CONVERSIONS_API_TOKEN = prior;
        }
    });

    it("records delivery and skips repeated checkout webhooks", async () => {
        const previous = {
            pixelId: process.env.META_PIXEL_ID,
            token: process.env.META_CONVERSIONS_API_TOKEN,
            version: process.env.META_GRAPH_API_VERSION,
        };
        process.env.META_PIXEL_ID = "1976407919770236";
        process.env.META_CONVERSIONS_API_TOKEN = "test-token";
        process.env.META_GRAPH_API_VERSION = "v24.0";
        const create = prisma.metaPurchaseDelivery.create as jest.Mock;
        const update = prisma.metaPurchaseDelivery.update as jest.Mock;
        const updateMany = prisma.metaPurchaseDelivery.updateMany as jest.Mock;
        const post = jest.spyOn(axios, "post").mockResolvedValue({ data: { events_received: 1 } });
        create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
            "duplicate", { code: "P2002", clientVersion: "5.16.0" },
        ));
        update.mockResolvedValue({});
        updateMany.mockResolvedValue({ count: 0 });

        try {
            await expect(sendMetaPurchaseFromCheckout(session())).resolves.toBe(true);
            await expect(sendMetaPurchaseFromCheckout(session())).resolves.toBe(false);
            expect(post).toHaveBeenCalledTimes(1);
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
        } finally {
            post.mockRestore();
            create.mockReset();
            update.mockReset();
            updateMany.mockReset();
            if (previous.pixelId) process.env.META_PIXEL_ID = previous.pixelId; else delete process.env.META_PIXEL_ID;
            if (previous.token) process.env.META_CONVERSIONS_API_TOKEN = previous.token; else delete process.env.META_CONVERSIONS_API_TOKEN;
            if (previous.version) process.env.META_GRAPH_API_VERSION = previous.version; else delete process.env.META_GRAPH_API_VERSION;
        }
    });

    it("reclaims a failed delivery and sends it once after retry", async () => {
        const previous = {
            pixelId: process.env.META_PIXEL_ID,
            token: process.env.META_CONVERSIONS_API_TOKEN,
            version: process.env.META_GRAPH_API_VERSION,
        };
        process.env.META_PIXEL_ID = "1976407919770236";
        process.env.META_CONVERSIONS_API_TOKEN = "test-token";
        process.env.META_GRAPH_API_VERSION = "v24.0";
        const create = prisma.metaPurchaseDelivery.create as jest.Mock;
        const update = prisma.metaPurchaseDelivery.update as jest.Mock;
        const updateMany = prisma.metaPurchaseDelivery.updateMany as jest.Mock;
        const post = jest.spyOn(axios, "post")
            .mockRejectedValueOnce(new Error("Meta unavailable"))
            .mockResolvedValueOnce({ data: { events_received: 1 } });
        create.mockResolvedValueOnce({}).mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
            "duplicate", { code: "P2002", clientVersion: "5.16.0" },
        ));
        update.mockResolvedValue({});
        updateMany.mockResolvedValue({ count: 1 });

        try {
            await expect(sendMetaPurchaseFromCheckout(session())).rejects.toThrow("Meta unavailable");
            await expect(sendMetaPurchaseFromCheckout(session())).resolves.toBe(true);
            expect(post).toHaveBeenCalledTimes(2);
            expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
                data: expect.objectContaining({ attemptCount: { increment: 1 } }),
            }));
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
            expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SENT" }) }));
        } finally {
            post.mockRestore();
            create.mockReset();
            update.mockReset();
            updateMany.mockReset();
            if (previous.pixelId) process.env.META_PIXEL_ID = previous.pixelId; else delete process.env.META_PIXEL_ID;
            if (previous.token) process.env.META_CONVERSIONS_API_TOKEN = previous.token; else delete process.env.META_CONVERSIONS_API_TOKEN;
            if (previous.version) process.env.META_GRAPH_API_VERSION = previous.version; else delete process.env.META_GRAPH_API_VERSION;
        }
    });
});
