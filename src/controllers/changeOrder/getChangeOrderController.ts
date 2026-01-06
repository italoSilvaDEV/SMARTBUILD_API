import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetChangeOrderController {
    async handle(req: Request, res: Response) {
        const {
            changeOrderId
        } = req.params;

        if (!changeOrderId) {
            return res.status(400).json({
                error: "Change order ID is required"
            })
        }

        try {
            const changeOrder = await prisma.changeOrder.findUnique({
                where: {
                    id: changeOrderId
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
                }
            })

            if (!changeOrder) {
                return res.status(404).json({
                    error: "Change order not found"
                })
            }

            const changeOrderWithPresignedUrls = {
                ...changeOrder,
                pdfProjects: await Promise.all(changeOrder.pdfProjects.map(async (pdfProject) => {
                    return {
                        ...pdfProject,
                        uri: pdfProject.uri ? await getPresignedUrl(pdfProject.uri) : null
                    }
                }))
            }

            return res.status(200).json({
                message: "Change order fetched successfully",
                data: changeOrderWithPresignedUrls
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}