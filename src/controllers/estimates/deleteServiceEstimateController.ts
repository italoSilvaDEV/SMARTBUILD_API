import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";

const DISCOUNT_ERRORS = new Set([
    "Percentage markup cannot be greater than 100",
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
    "Percentage deposit cannot be greater than 100",
    "Fixed deposit cannot be greater than estimate total",
]);

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
                estimate: {
                    select: {
                        project: {
                            select: {
                                company_id: true,
                            }
                        }
                    }
                }
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
                    const estimate = await smartbuild.estimate.findUnique({
                        where: {
                            id: serviceEstimate.estimateId
                        },
                        select: {
                            status: true,
                            type_estimate: true
                        }
                    })

                    const siblingProject = await smartbuild.serviceProject.findFirst({
                        where: {
                            estimateServiceId: serviceId
                        }
                    })

                    if (siblingProject) {
                        await smartbuild.serviceProject.delete({
                            where: { id: siblingProject.id }
                        })
                    }

                    await smartbuild.estimateServiceProject.delete({
                        where: {
                            id: serviceId
                        }
                    })

                    await syncEstimateDiscountedServices(smartbuild, serviceEstimate.estimateId)

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

                fireAndForgetUpsertEstimateToQBO(serviceEstimate.estimate?.project?.company_id, (req as any).userId, serviceEstimate.estimateId);

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
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

            return res.status(500).json({
                error: "Internal server error while deleting service estimate"
            })
        }
    }
}

