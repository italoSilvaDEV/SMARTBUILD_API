import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class CreateNewEstimateController {
    async handle(req: Request, res: Response) {
        const {
            approvedAt,
            totalAmount,
            description,
            terms,
            status,
            preGeneratedNumber,
            projectId,
            idPdfProject,
            type_estimate
        } = req.body

        if (!projectId || !idPdfProject || !preGeneratedNumber || !totalAmount || !type_estimate) {
            return res.status(400).json({
                error: "Project ID, PDF Project ID, preGeneratedNumber and type_estimate are required"
            })
        }

        const project = await prisma.project.findUnique({
            where: {
                id: projectId
            }
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const createEstimate = await smartbuild.estimate.create({
                    data: {
                        number: preGeneratedNumber,
                        approvedAt,
                        totalAmount: Number(totalAmount),
                        description,
                        terms,
                        status,
                        type_estimate,
                        project: {
                            connect: {
                                id: projectId
                            }
                        },
                    }
                })

                await smartbuild.estimateServiceProject.findMany({
                    where: {
                        estimateId: createEstimate.id
                    }
                })

                await smartbuild.estimate.update({
                    where: {
                        id: createEstimate.id
                    },
                    data: {
                        totalAmount: Number(totalAmount)
                    }
                })


                await smartbuild.pdfProject.update({
                    where: {
                        id: idPdfProject
                    },
                    data: {
                        project_id: projectId
                    }
                })

                await smartbuild.pdfProject.update({
                    where: {
                        id: idPdfProject
                    },
                    data: {
                        estimate_id: createEstimate.id
                    }
                })

                return res.status(201).json({
                    message: "Estimate created successfully",
                    data: {
                        ...createEstimate,
                        totalAmount: Number(totalAmount)
                    }
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while creating new estimate"
            })
        }
    }
}