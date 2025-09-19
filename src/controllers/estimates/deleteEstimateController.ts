import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class DeleteEstimateController {
    async handle(req: Request, res: Response) {
        const {
            estimateId
        } = req.params

        if (!estimateId) {
            return res.status(400).json({
                error: "Estimate ID is required"
            })
        }

        const estimate = await prisma.estimate.findUnique({
            where: {
                id: estimateId
            },
            select: {
                status: true,
                projectId: true,
                type_estimate: true,
                project: {
                    select: {
                        status_project: true,
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        if (estimate.status === "approved") {
            return res.status(400).json({
                error: "It is not possible to delete an approved estimate."
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                await smartbuild.estimate.delete({
                    where: {
                        id: estimateId
                    }
                })

                if (estimate.type_estimate === "estimate") {
                    await smartbuild.project.delete({
                        where: {
                            id: estimate.projectId
                        }
                    })
                }

                return res.status(200).json({
                    message: "Estimate deleted successfully"
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while deleting estimate"
            })
        }
    }
}