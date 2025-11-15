import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { ChangeOrderStatus } from "@prisma/client";

interface UpdateChangeOrderPayload {
    changeOrderId: string
    scopeOfWork?: string
    totalAmount?: number
    status?: ChangeOrderStatus
}

export class UpdateChangeOrderController {
    async handle(req: Request, res: Response) {
        const payload = req.body as UpdateChangeOrderPayload

        if (!payload.changeOrderId) {
            return res.status(400).json({
                error: "Change order ID is required"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const changeOrder = await smartbuild.changeOrder.findUnique({
                    where: {
                        id: payload.changeOrderId
                    }
                })

                if (!changeOrder) {
                    return res.status(404).json({
                        error: "Change order not found"
                    })
                }

                let newData = {} as UpdateChangeOrderPayload

                if (payload.scopeOfWork
                    && payload.scopeOfWork !== (changeOrder.scope_of_work || "")) {
                    newData.scopeOfWork = payload.scopeOfWork

                } else if (payload.totalAmount) {
                    newData.totalAmount = payload.totalAmount

                } else if (payload.status
                    && payload.status !== changeOrder.status
                    && ["pending", "approved", "canceled"].includes(payload.status)) {
                    newData.status = payload.status
                }

                if (Object.keys(newData).length === 0) {
                    return res.status(400).json({
                        error: "No valid data to update"
                    })
                }

                console.log(newData)

                const updatedChangeOrder = await smartbuild.changeOrder.update({
                    where: {
                        id: changeOrder.id
                    },
                    data: newData
                })

                return res.status(200).json({
                    message: "Change order updated successfully",
                    data: updatedChangeOrder
                })
            })
        } catch (error) {
            console.log(error)
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
