import { TypeEstimate } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

type payloadCreateEstimate = {
    approvedAt: Date;
    totalAmount: number;
    description: string;
    terms: string;
    status: string;
    preGeneratedNumber: string;
    projectId: string;
    idPdfProject: string;
    type_estimate: TypeEstimate;
}

export class CreateNewEstimateController {
    async handle(req: Request, res: Response) {
        const payloadCreateEstimate = req.body as payloadCreateEstimate

        if (!payloadCreateEstimate.projectId ||
            !payloadCreateEstimate.idPdfProject ||
            !payloadCreateEstimate.preGeneratedNumber ||
            !payloadCreateEstimate.totalAmount ||
            !payloadCreateEstimate.type_estimate) {

            return res.status(400).json({
                error: "Project ID, PDF Project ID, preGeneratedNumber and type_estimate are required"
            })
        }

        const project = await prisma.project.findUnique({
            where: {
                id: payloadCreateEstimate.projectId
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
                        number: payloadCreateEstimate.preGeneratedNumber,
                        approvedAt: payloadCreateEstimate.approvedAt,
                        totalAmount: Number(payloadCreateEstimate.totalAmount),
                        description: payloadCreateEstimate.description,
                        terms: payloadCreateEstimate.terms,
                        status: payloadCreateEstimate.status,
                        type_estimate: payloadCreateEstimate.type_estimate,
                        project: {
                            connect: {
                                id: payloadCreateEstimate.projectId
                            }
                        },
                    }
                })

                await smartbuild.project.update({
                    where: {
                        id: payloadCreateEstimate.projectId
                    },
                    data: {
                        price: Number(payloadCreateEstimate.totalAmount)
                    }
                })

                if (createEstimate.type_estimate === "estimateProject") {
                    const servicesExist = await smartbuild.serviceProject.findMany({
                        where: {
                            projectId: payloadCreateEstimate.projectId
                        }
                    })

                    if (servicesExist.length > 0) {
                        await smartbuild.serviceProject.deleteMany({
                            where: {
                                projectId: payloadCreateEstimate.projectId
                            }
                        })
                    }
                }

                await smartbuild.pdfProject.update({
                    where: {
                        id: payloadCreateEstimate.idPdfProject
                    },
                    data: {
                        project_id: payloadCreateEstimate.projectId
                    }
                })

                await smartbuild.pdfProject.update({
                    where: {
                        id: payloadCreateEstimate.idPdfProject
                    },
                    data: {
                        estimate_id: createEstimate.id
                    }
                })

                return res.status(201).json({
                    message: "Estimate created successfully",
                    data: {
                        ...createEstimate,
                        totalAmount: Number(payloadCreateEstimate.totalAmount)
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