import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";

export class DeleteChangeOrderServiceController {
    async handle(req: Request, res: Response) {
        const {
            changeOrderServiceId
        } = req.params

        try {
            if (!changeOrderServiceId) {
                return res.status(404).json({
                    error: "Change order service ID is required"
                })
            }

            await prisma.$transaction(async (smartbuild) => {
                const changeOrderService = await smartbuild.changeOrderService.findUnique({
                    where: {
                        id: changeOrderServiceId
                    },
                    select: {
                        id: true
                    }
                })

                if (!changeOrderService) {
                    return res.status(404).json({
                        error: "Change order service not found"
                    })
                }

                await smartbuild.changeOrderService.delete({
                    where: {
                        id: changeOrderService.id
                    }
                })

                return res.status(200).json({
                    message: "Change order service deleted successfully"
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}