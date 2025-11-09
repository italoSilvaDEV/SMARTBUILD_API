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
    multi_emails: string;
    date_creation?: string;
    workContextId?: string;
    cancelEstimates?: boolean
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
            },
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                if (payloadCreateEstimate.cancelEstimates) {
                    await smartbuild.estimate.updateMany({
                        where: {
                            projectId: payloadCreateEstimate.projectId
                        },
                        data: {
                            status: "canceled"
                        }
                    })
                }

                const createEstimate = await smartbuild.estimate.create({
                    data: {
                        number: payloadCreateEstimate.preGeneratedNumber,
                        approvedAt: payloadCreateEstimate.approvedAt,
                        totalAmount: Number(payloadCreateEstimate.totalAmount),
                        balanceDue: Number(payloadCreateEstimate.totalAmount),
                        amountPaid: 0,
                        description: payloadCreateEstimate.description,
                        terms: payloadCreateEstimate.terms,
                        status: payloadCreateEstimate.status,
                        type_estimate: payloadCreateEstimate.type_estimate,
                        multi_emails: payloadCreateEstimate.multi_emails,
                        date_creation: payloadCreateEstimate.date_creation ? new Date(payloadCreateEstimate.date_creation) : new Date(),
                        project: {
                            connect: {
                                id: payloadCreateEstimate.projectId
                            }
                        },
                    }
                })

                if (createEstimate.type_estimate === "estimateProject") {
                    const updateData: any = {}

                    if (payloadCreateEstimate.workContextId) {
                        updateData.workContextId = payloadCreateEstimate.workContextId;
                    }

                    await smartbuild.project.update({
                        where: {
                            id: payloadCreateEstimate.projectId
                        },
                        data: updateData,
                    })
                } else {
                    const updateData: any = {
                        price: Number(payloadCreateEstimate.totalAmount),
                        balanceDue: Number(payloadCreateEstimate.totalAmount) || 0
                    };

                    if (payloadCreateEstimate.workContextId) {
                        updateData.workContextId = payloadCreateEstimate.workContextId;
                    }

                    await smartbuild.project.update({
                        where: {
                            id: payloadCreateEstimate.projectId
                        },
                        data: updateData
                    })
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