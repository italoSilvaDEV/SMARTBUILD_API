import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface CreateChangeOrderPayload {
    estimateId: string
    scopeOfWork?: string
    totalAmount: number
    services: {
        name: string
        description?: string
        quantity: number
        unitPrice: number
        lineTotal: number
        price: number
    }[]
}

export class CreateChangeOrderController {
    async handle(req: Request, res: Response) {
        const payload = req.body as CreateChangeOrderPayload

        if (!payload.estimateId || !payload.totalAmount || !payload.services) {
            return res.status(400).json({
                error: "Estimate ID, total amount and services are required"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const estimate = await smartbuild.estimate.findUnique({
                    where: {
                        id: payload.estimateId
                    },
                    select: {
                        id: true,
                    }
                })

                if (!estimate) {
                    return res.status(404).json({
                        error: "Estimate not found"
                    })
                }

                const changeOrder = await smartbuild.changeOrder.create({
                    data: {
                        estimateId: payload.estimateId,
                        total_amount: payload.totalAmount,
                        scope_of_work: payload.scopeOfWork || "",
                    }
                })

                for (const service of payload.services) {
                    if (!service.name
                        || !service.quantity
                        || !service.unitPrice
                        || !service.lineTotal
                        || !service.price
                    ) {
                        return res.status(400).json({
                            error: "Name, quantity, unitPrice, lineTotal and price are required"
                        })
                    }

                    await smartbuild.changeOrderService.create({
                        data: {
                            changeOrderId: changeOrder.id,
                            name: service.name,
                            description: service.description || "",
                            quantity: service.quantity,
                            unitPrice: service.unitPrice,
                            lineTotal: service.lineTotal,
                            price: service.price,
                        }
                    })
                }

                // Parece redundante, mas é para retornar o change order com os serviços atualizados.
                const data = await smartbuild.changeOrder.findUnique({
                    where: {
                        id: changeOrder.id
                    }
                })

                return res.status(201).json({
                    message: "Change order created successfully",
                    data: data
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}