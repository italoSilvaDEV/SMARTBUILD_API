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

        const serviceEstimate = await prisma.estimateServiceProject.findUnique({
            where: {
                id: serviceId
            }
        })

        const serviceProject = await prisma.serviceProject.findUnique({
            where: {
                id: serviceId
            }
        })

        if (!serviceEstimate && !serviceProject) {
            return res.status(404).json({
                error: "Service not found"
            })
        }

        try {
            if (serviceEstimate) {
                await prisma.estimateServiceProject.delete({
                    where: {
                        id: serviceId
                    }
                })

                return res.status(200).json({
                    message: "Service estimate deleted successfully"
                })
            }

            if (serviceProject) {
                await prisma.serviceProject.delete({
                    where: {
                        id: serviceId
                    }
                })

                return res.status(200).json({
                    message: "Service project deleted successfully"
                })
            }
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while deleting service estimate"
            })
        }
    }
}