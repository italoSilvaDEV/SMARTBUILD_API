import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetAllChangeOrderByProjectController {
    async handle(req: Request, res: Response) {
        const { projectId } = req.params

        if (!projectId) {
            return res.status(400).json({
                error: "Project ID is required"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const project = await smartbuild.project.findUnique({
                    where: {
                        id: projectId
                    },
                    select: {
                        id: true,
                    }
                })

                if (!project) {
                    return res.status(404).json({
                        error: "Project not found"
                    })
                }

                const changeOrders = await smartbuild.changeOrder.findMany({
                    where: {
                        OR: [
                            { projectId: projectId },
                            {
                                projectId: null,
                                estimate: { projectId: projectId }
                            }
                        ]
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