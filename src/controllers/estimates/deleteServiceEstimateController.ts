import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DeleteServiceEstimateController {
    async handle(req: Request, res: Response) {
        const {
            serviceId,
            estimateId
        } = req.body

        if (!serviceId || !estimateId) {
            return res.status(400).json({
                error: "Service ID and Estimate ID are required"
            })
        }

        const estimate = await prisma.estimate.findUnique({
            where: {
                id: estimateId
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
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

        if (service.estimateId !== estimateId) {
            return res.status(400).json({
                error: "Service does not belong to the estimate"
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