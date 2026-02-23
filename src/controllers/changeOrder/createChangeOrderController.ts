import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

interface CreateChangeOrderPayload {
    estimateId: string
    supervisorId: string
    totalAmount: number
    projectId: string
    pdfId: string
    services: {
        name: string
        description?: string
        quantity: number
        unitPrice: number
        lineTotal: number
        price: number
    }[]
}

export class CreateChangeOrderController {
    async handle(req: Request, res: Response) {
        const payload = req.body as CreateChangeOrderPayload

        if (!payload.estimateId || !payload.projectId || !payload.totalAmount || !payload.services || !payload.supervisorId || !payload.pdfId) {
            return res.status(400).json({
                error: "Estimate ID, project ID, total amount, services, supervisor ID and pdf ID are required"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const estimate = await smartbuild.estimate.findUnique({
                    where: {
                        id: payload.estimateId
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

                const supervisor = await smartbuild.user.findUnique({
                    where: {
                        id: payload.supervisorId
                    },
                    select: {
                        id: true,
                    }
                })

                if (!supervisor) {
                    return res.status(404).json({
                        error: "Supervisor not found"
                    })
                }

                const [lastByEstimate, lastByProject] = await Promise.all([
                    smartbuild.changeOrder.findFirst({
                        where: { estimateId: payload.estimateId },
                        orderBy: { number: "desc" },
                        select: { number: true }
                    }),
                    smartbuild.changeOrder.findFirst({
                        where: { projectId: payload.projectId },
                        orderBy: { number: "desc" },
                        select: { number: true }
                    })
                ]);

                const maxNumber = Math.max(
                    lastByEstimate?.number ?? 0,
                    lastByProject?.number ?? 0
                );
                const nextNumber = maxNumber + 1;

                const changeOrder = await smartbuild.changeOrder.create({
                    data: {
                        estimateId: payload.estimateId,
                        total_amount: payload.totalAmount,
                        projectId: payload.projectId,
                        number: nextNumber,
                        supervisorId: supervisor.id,
                    }
                })

                for (const service of payload.services) {
                    if (!service.name
                        || !service.quantity
                        || !service.unitPrice
                        || !service.lineTotal
                        || !service.price
                    ) {
                        return res.status(400).json({
                            error: "Name, quantity, unitPrice, lineTotal and price are required"
                        })
                    }

                    await smartbuild.changeOrderService.create({
                        data: {
                            changeOrderId: changeOrder.id,
                            name: service.name,
                            description: service.description || "",
                            quantity: service.quantity,
                            unitPrice: service.unitPrice,
                            lineTotal: service.lineTotal,
                            price: service.price,
                        }
                    })
                }

                // Parece redundante, mas é para retornar o change order com os serviços atualizados.
                const data = await smartbuild.changeOrder.findUnique({
                    where: {
                        id: changeOrder.id
                    }
                })

                const pdfProject = await smartbuild.pdfProject.findUnique({
                    where: {
                        id: payload.pdfId
                    }
                })

                if (pdfProject) {
                    await smartbuild.pdfProject.update({
                        where: {
                            id: pdfProject.id
                        },
                        data: {
                            changeOrderId: changeOrder.id
                        }
                    })
                }

                return res.status(201).json({
                    message: "Change order created successfully",
                    data: data
                })
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}