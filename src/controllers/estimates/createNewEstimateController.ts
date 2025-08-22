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
            const estimate = await prisma.estimate.create({
                data: {
                    number: preGeneratedNumber,
                    approvedAt,
                    totalAmount: Number(totalAmount),
                    description,
                    terms,
                    status,
                    project: {
                        connect: {
                            id: projectId
                        }
                    },
                    type_estimate: type_estimate
                }
            })

            await prisma.estimateServiceProject.findMany({
                where: {
                    estimateId: estimate.id
                }
            })

            await prisma.estimate.update({
                where: {
                    id: estimate.id
                },
                data: {
                    totalAmount: Number(totalAmount)
                }
            })

            await prisma.pdfProject.update({
                where: {
                    id: idPdfProject
                },
                data: {
                    project_id: projectId
                }
            })

            await prisma.pdfProject.update({
                where: {
                    id: idPdfProject
                },
                data: {
                    estimate_id: estimate.id
                }
            })

            return res.status(201).json({
                message: "Estimate created successfully",
                data: {
                    ...estimate,
                    totalAmount: Number(totalAmount)
                }
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while creating new estimate"
            })
        }
    }
}