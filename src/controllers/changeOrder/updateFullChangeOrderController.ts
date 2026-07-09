import { Request, Response } from "express";
import { ChangeOrderStatus } from "@prisma/client";
import { prisma } from "../../utils/prisma";

interface UpdateFullChangeOrderServicePayload {
    id?: string;
    name: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    lineTotal?: number;
    price: number;
}

interface UpdateFullChangeOrderPayload {
    changeOrderId: string;
    status?: ChangeOrderStatus;
    services: UpdateFullChangeOrderServicePayload[];
}

const toNumber = (value: unknown, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

export class UpdateFullChangeOrderController {
    async handle(req: Request, res: Response) {
        const payload = req.body as UpdateFullChangeOrderPayload;

        if (!payload.changeOrderId) {
            return res.status(400).json({ error: "Change order ID is required" });
        }

        if (!Array.isArray(payload.services) || payload.services.length === 0) {
            return res.status(400).json({ error: "At least one service is required" });
        }

        try {
            const updatedChangeOrder = await prisma.$transaction(async (smartbuild) => {
                const changeOrder = await smartbuild.changeOrder.findUnique({
                    where: { id: payload.changeOrderId },
                    include: { changeOrderServices: true }
                });

                if (!changeOrder) {
                    throw new Error("CHANGE_ORDER_NOT_FOUND");
                }

                if (changeOrder.status !== "pending") {
                    throw new Error("CHANGE_ORDER_NOT_EDITABLE");
                }

                const normalizedServices = payload.services.map((service) => {
                    const quantity = toNumber(service.quantity);
                    const unitPrice = toNumber(service.unitPrice ?? service.price);
                    const price = toNumber(service.price ?? service.unitPrice);
                    const lineTotal = toNumber(service.lineTotal, quantity * unitPrice);

                    if (!service.name || quantity <= 0 || unitPrice <= 0 || price <= 0 || lineTotal <= 0) {
                        throw new Error("INVALID_SERVICE_PAYLOAD");
                    }

                    return {
                        id: service.id,
                        name: service.name,
                        description: service.description || "",
                        quantity,
                        unitPrice,
                        price,
                        lineTotal,
                    };
                });

                const existingIds = new Set(changeOrder.changeOrderServices.map((service) => service.id));
                const incomingExistingIds = new Set(
                    normalizedServices
                        .map((service) => service.id)
                        .filter((id): id is string => Boolean(id))
                        .filter((id) => existingIds.has(id))
                );

                await smartbuild.changeOrderService.deleteMany({
                    where: {
                        changeOrderId: changeOrder.id,
                        id: { notIn: Array.from(incomingExistingIds) }
                    }
                });

                for (const service of normalizedServices) {
                    if (service.id && existingIds.has(service.id)) {
                        await smartbuild.changeOrderService.update({
                            where: { id: service.id },
                            data: {
                                name: service.name,
                                description: service.description,
                                quantity: service.quantity,
                                unitPrice: service.unitPrice,
                                price: service.price,
                                lineTotal: service.lineTotal,
                            }
                        });
                    } else {
                        await smartbuild.changeOrderService.create({
                            data: {
                                changeOrderId: changeOrder.id,
                                name: service.name,
                                description: service.description,
                                quantity: service.quantity,
                                unitPrice: service.unitPrice,
                                price: service.price,
                                lineTotal: service.lineTotal,
                            }
                        });
                    }
                }

                const totalAmount = normalizedServices.reduce((sum, service) => sum + service.lineTotal, 0);
                const updateData: { total_amount: number; status?: ChangeOrderStatus } = {
                    total_amount: totalAmount
                };

                if (payload.status && payload.status !== changeOrder.status && ["pending", "approved", "canceled"].includes(payload.status)) {
                    updateData.status = payload.status;
                }

                await smartbuild.changeOrder.update({
                    where: { id: changeOrder.id },
                    data: updateData
                });

                return smartbuild.changeOrder.findUnique({
                    where: { id: changeOrder.id },
                    include: {
                        changeOrderServices: true,
                        pdfProjects: true,
                        estimate: {
                            include: {
                                project: {
                                    include: {
                                        client: true,
                                        company: true,
                                        workContext: true
                                    }
                                }
                            }
                        },
                        supervisor: true
                    }
                });
            });

            return res.status(200).json({
                message: "Change order updated successfully",
                data: updatedChangeOrder
            });
        } catch (error: any) {
            if (error?.message === "CHANGE_ORDER_NOT_FOUND") {
                return res.status(404).json({ error: "Change order not found" });
            }

            if (error?.message === "CHANGE_ORDER_NOT_EDITABLE") {
                return res.status(400).json({ error: "Only pending change orders can be edited" });
            }

            if (error?.message === "INVALID_SERVICE_PAYLOAD") {
                return res.status(400).json({ error: "Name, quantity, unitPrice, lineTotal and price are required" });
            }

            console.error("[UpdateFullChangeOrderController] Error:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}
