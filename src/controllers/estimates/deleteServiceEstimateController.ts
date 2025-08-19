import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DeleteServiceEstimateController {
    async handle(req: Request, res: Response) {
        const {
            serviceId,
        } = req.params

        if (!serviceId) {
            return res.status(400).json({
                error: "Service ID required"
            })
        }

        const service = await prisma.estimateServiceProject.findUnique({
            where: {
                id: serviceId
            }
        })

        if (!service) {
            return res.status(404).json({
                error: "Service not found"
            })
        }

        try {
            await prisma.estimateServiceProject.delete({
                where: {
                    id: serviceId
                }
            })

            return res.status(200).json({
                message: "Service deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while deleting service estimate"
            })
        }
    }
}