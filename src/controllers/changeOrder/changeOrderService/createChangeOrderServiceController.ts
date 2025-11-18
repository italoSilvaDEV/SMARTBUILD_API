import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

interface CreateChangeOrderServicePayload {
    name: string
    description?: string
    quantity: number
    unitPrice: number
    lineTotal: number
    price: number
    changeOrderId: string
}

export class CreateChangeOrderServiceController {
    async handle(req: Request, res: Response) {
        const payload = req.body as CreateChangeOrderServicePayload

        try {
            if (!payload.changeOrderId) {
                return res.status(404).json({
                    error: "Change order ID is required"
                })
            }

            await prisma.$transaction(async (smartbuild) => {
                const changeOrder = await smartbuild.changeOrder.findUnique({
                    where: {
                        id: payload.changeOrderId
                    },
                    select: {
                        id: true
                    }
                })

                if (!changeOrder) {
                    return res.status(404).json({
                        error: "Change order not found"
                    })
                }

                if (!payload.name
                    || !payload.quantity
                    || !payload.unitPrice
                    || !payload.lineTotal
                    || !payload.price
                ) {
                    return res.status(400).json({
                        error: "Name, quantity, unitPrice, lineTotal and price are required"
                    })
                }

                const newService = await smartbuild.changeOrderService.create({
                    data: {
                        changeOrderId: changeOrder.id,
                        name: payload.name,
                        description: payload.description,
                        quantity: payload.quantity,
                        unitPrice: payload.unitPrice,
                        lineTotal: payload.lineTotal,
                        price: payload.price,
                    }
                })

                return res.status(201).json({
                    message: "Change order service created successfully",
                    data: newService
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}