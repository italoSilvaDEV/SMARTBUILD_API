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

                let createEstimate = null

                if (payloadCreateEstimate.type_estimate === "estimateProject") {
                    const numberEstimate = await smartbuild.estimate.findMany({
                        where: {
                            type_estimate: "estimateProject",
                            project: {
                                id: payloadCreateEstimate.projectId
                            }
                        },
                    })

                    const number = numberEstimate.length + 1

                    createEstimate = await smartbuild.estimate.create({
                        data: {
                            number: `${project.contract_number}-0${number}`,
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
                } else {
                    createEstimate = await smartbuild.estimate.create({
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
                }

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
                        totalAmount: Number(payloadCreateEstimate.totalAmount)
                    }
                })

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