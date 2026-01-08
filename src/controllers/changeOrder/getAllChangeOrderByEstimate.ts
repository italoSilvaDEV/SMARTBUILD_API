import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetAllChangeOrderByEstimateController {
    async handle(req: Request, res: Response) {
        const { estimateId } = req.params

        if (!estimateId) {
            return res.status(400).json({
                error: "Estimate ID is required"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const estimate = await smartbuild.estimate.findUnique({
                    where: {
                        id: estimateId
                    },
                    select: {
                        id: true,
                    }
                })

                if (!estimate) {
                    return res.status(404).json({
                        error: "Estimate not found"
                    })
                }

                const changeOrders = await smartbuild.changeOrder.findMany({
                    where: {
                        estimateId: estimateId
                    },
                    include: {
                        changeOrderServices: true,
                        pdfProjects: true,
                        estimate: {
                            select: {
                                project: {
                                    select: {
                                        id: true,
                                        client: true,
                                        workContextId: true,
                                    }
                                }
                            }
                        }
                    },
                    orderBy: {
                        date_creation: "desc"
                    }
                })

                const changeOrdersWithPresignedUrls = await Promise.all(changeOrders.map(async (changeOrder) => {
                    const changeOrderWithPresignedUrls = {
                        ...changeOrder,
                        pdfProjects: await Promise.all(changeOrder.pdfProjects.map(async (pdfProject) => {
                            return {
                                ...pdfProject,
                                uri: pdfProject.uri ? await getPresignedUrl(pdfProject.uri) : null
                            }
                        }))
                    }

                    return changeOrderWithPresignedUrls
                }))

                return res.status(200).json({
                    message: "Change orders fetched successfully",
                    data: changeOrdersWithPresignedUrls
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}