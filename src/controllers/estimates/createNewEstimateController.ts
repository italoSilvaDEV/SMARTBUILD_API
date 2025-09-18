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
            select: {
                amountPaid: true
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
                        balanceDue: Number(payloadCreateEstimate.totalAmount),
                        amountPaid: 0,
                        description: payloadCreateEstimate.description,
                        terms: payloadCreateEstimate.terms,
                        status: payloadCreateEstimate.status,
                        type_estimate: payloadCreateEstimate.type_estimate,
                        multi_emails: payloadCreateEstimate.multi_emails,
                        project: {
                            connect: {
                                id: payloadCreateEstimate.projectId
                            }
                        },
                    }
                })

                if (createEstimate.type_estimate === "estimateProject") {
                    const servicesExist = await smartbuild.serviceProject.findMany({
                        where: {
                            projectId: payloadCreateEstimate.projectId
                        }
                    })

                    const totalPrice = servicesExist.reduce((total, service) => {
                        return total + Number(service.price) * Number(service.hours)
                    }, 0)

                    await smartbuild.project.update({
                        where: {
                            id: payloadCreateEstimate.projectId
                        },
                        data: {
                            price: totalPrice,
                            balanceDue: totalPrice - Number(project.amountPaid)
                        },
                    })
                } else {
                    await smartbuild.project.update({
                        where: {
                            id: payloadCreateEstimate.projectId
                        },
                        data: {
                            price: Number(payloadCreateEstimate.totalAmount),
                            balanceDue: Number(payloadCreateEstimate.totalAmount) - Number(project.amountPaid)
                        }
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