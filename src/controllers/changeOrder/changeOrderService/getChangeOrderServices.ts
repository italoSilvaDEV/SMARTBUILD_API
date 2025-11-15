import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

export class GetChangeOrderServicesController {
    async handle(req: Request, res: Response) {
        const {
            changeOrderId
        } = req.params

        try {
            if (!changeOrderId) {
                return res.status(404).json({
                    error: "Change order ID is required"
                })
            }

            await prisma.$transaction(async (smartbuild) => {
                const changeOrder = await smartbuild.changeOrder.findUnique({
                    where: {
                        id: changeOrderId
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

                const changeOrderServices = await smartbuild.changeOrderService.findMany({
                    where: {
                        changeOrderId: changeOrder.id
                    }
                })

                return res.status(200).json({
                    message: "Change order services fetched successfully",
                    data: changeOrderServices
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}