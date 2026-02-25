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
            },
            select: {
                estimateId: true,
            }
        })

        const serviceProject = await prisma.serviceProject.findUnique({
            where: {
                id: serviceId
            },
            select: {
                projectId: true,
            }
        })

        if (!serviceEstimate && !serviceProject) {
            return res.status(404).json({
                error: "Service not found"
            })
        }

        try {
            if (serviceEstimate) {
                await prisma.$transaction(async (smartbuild) => {
                    const siblingProject = await smartbuild.serviceProject.findFirst({
                        where: {
                            estimateServiceId: serviceId
                        }
                    })

                    if (siblingProject) {
                        await smartbuild.serviceProject.update({
                            where: { id: siblingProject.id },
                            data: {
                                projectId: null,
                                estimateServiceId: null
                            }
                        })
                    }

                    await smartbuild.estimateServiceProject.delete({
                        where: {
                            id: serviceId
                        }
                    })

                    const estimate = await smartbuild.estimate.findUnique({
                        where: {
                            id: serviceEstimate.estimateId
                        },
                        select: {
                            status: true,
                            type_estimate: true
                        }
                    })

                    if (estimate?.status === "approved" && estimate?.type_estimate === "estimateProject") {
                        await smartbuild.estimate.update({
                            where: {
                                id: serviceEstimate.estimateId
                            },
                            data: {
                                assignatureRequired: true
                            }
                        })
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