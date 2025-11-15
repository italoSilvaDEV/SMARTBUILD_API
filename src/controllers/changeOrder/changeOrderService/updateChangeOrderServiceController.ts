import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

interface UpdateChangeOrderServicePayload {
    name?: string
    description?: string
    quantity?: number
    unitPrice?: number
    lineTotal?: number
    price?: number
    changeOrderServiceId: string
}

export class UpdateChangeOrderServiceController {
    async handle(req: Request, res: Response) {
        const payload = req.body as UpdateChangeOrderServicePayload

        try {
            if (!payload.changeOrderServiceId) {
                return res.status(404).json({
                    error: "Change order service ID is required"
                })
            }

            await prisma.$transaction(async (smartbuild) => {
                const changeOrderService = await smartbuild.changeOrderService.findUnique({
                    where: {
                        id: payload.changeOrderServiceId
                    },
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        quantity: true,
                        unitPrice: true,
                        lineTotal: true,
                        price: true,
                    }
                })

                if (!changeOrderService) {
                    return res.status(404).json({
                        error: "Change order service not found"
                    })
                }

                let newData = {} as UpdateChangeOrderServicePayload

                if (payload.name && payload.name !== changeOrderService.name) {
                    newData.name = payload.name
                }
                if (payload.description && payload.description !== changeOrderService.description) {
                    newData.description = payload.description
                }
                if (payload.quantity && payload.quantity !== changeOrderService.quantity) {
                    newData.quantity = payload.quantity
                }
                if (payload.unitPrice && Number(payload.unitPrice) !== Number(changeOrderService.unitPrice)) {
                    newData.unitPrice = payload.unitPrice
                }
                if (payload.lineTotal && Number(payload.lineTotal) !== Number(changeOrderService.lineTotal)) {
                    newData.lineTotal = payload.lineTotal
                }
                if (payload.price && Number(payload.price) !== Number(changeOrderService.price)) {
                    newData.price = payload.price
                }

                if (Object.keys(newData).length === 0) {
                    return res.status(400).json({
                        error: "No valid data to update"
                    })
                }

                const updatedChangeOrderService = await smartbuild.changeOrderService.update({
                    where: {
                        id: changeOrderService.id
                    },
                    data: newData
                })

                return res.status(200).json({
                    message: "Change order service updated successfully",
                    data: updatedChangeOrderService
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}