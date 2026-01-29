import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";

export class ConvertToProjectController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
        } = req.body

        if (!estimateId) {
            return res.status(400).json({
                error: "Estimate ID is required"
            })
        }

        const estimate = await prisma.estimate.findUnique({
            where: {
                id: estimateId
            },
            select: {
                projectId: true,
                serviceProjects: {
                    select: {
                        id: true,
                        name: true,
                        description: true,
                        hours: true,
                        price: true,
                        id_service: true,
                    }
                },
                status: true,
                totalAmount: true,
                project: {
                    select: {
                        company_id: true,
                        status_project: true,
                        contract_number: true,
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        if (!estimate.projectId || !estimate.project || !estimate.project.company_id) {
            return res.status(400).json({
                error: "Estimate has no project or company"
            })
        }

        try {
            await prisma.$transaction(async (smartbuild) => {
                const project = await smartbuild.project.update({
                    where: {
                        id: estimate.projectId
                    },
                    data: {
                        status_project: "Pre-Start",
                        price: Number(estimate.totalAmount),
                    },
                    select: {
                        id: true,
                        contract_number: true
                    }
                })

                await smartbuild.estimate.update({
                    where: {
                        id: estimateId
                    },
                    data: {
                        number: project.contract_number ? `${project.contract_number}-01` : undefined,
                        type_estimate: "estimateProject" as any
                    }
                })

                if (estimate.serviceProjects && estimate.serviceProjects.length > 0) {
                    // Verificar quais ServiceProjects já existem
                    const existingServiceProjects = await smartbuild.serviceProject.findMany({
                        where: {
                            estimateServiceId: {
                                in: estimate.serviceProjects.map(s => s.id)
                            }
                        },
                        select: {
                            estimateServiceId: true
                        }
                    });

                    const existingIds = new Set(existingServiceProjects.map(sp => sp.estimateServiceId));

                    // Criar apenas os ServiceProjects que não existem
                    const servicesToCreate = estimate.serviceProjects
                        .filter(service => !existingIds.has(service.id))
                        .map((service) => ({
                            name: service.name,
                            description: service.description || "",
                            hours: service.hours ? Number(service.hours) : 0,
                            price: service.price ? Number(service.price) : 0,
                            id_service: service.id_service || null,
                            projectId: estimate.projectId,
                            company_id: estimate.project.company_id,
                            estimateServiceId: service.id
                        }));

                    if (servicesToCreate.length > 0) {
                        await smartbuild.serviceProject.createMany({
                            data: servicesToCreate
                        })
                    }
                }

                if (estimate.status !== "approved") {
                    await smartbuild.estimate.update({
                        where: {
                            id: estimateId
                        },
                        data: {
                            status: "approved"
                        }
                    })
                }

                const invoicesEstimate = await smartbuild.invoice.findMany({
                    where: {
                        estimateId: estimateId
                    },
                    select: {
                        type_invoicebase: true,
                        id: true
                    }
                })

                for (const inv of invoicesEstimate) {
                    if (inv.type_invoicebase === "estimate") {
                        await smartbuild.invoice.update({
                            where: { id: inv.id },
                            data: { type_invoicebase: "project" as any }
                        })
                    }
                }

                const paymentsHistory = await smartbuild.invoicePaymentTimeLine.findMany({
                    where: {
                        estimateId: estimateId
                    }
                })

                for (const pay of paymentsHistory) {
                    if (pay.estimateId) {
                        await smartbuild.invoicePaymentTimeLine.update({
                            where: {
                                id: pay.id
                            },
                            data: {
                                estimateId: null,
                                projectId: project.id
                            }
                        })
                    }
                }
            })

            return res.status(200).json({
                message: "Estimate converted to project successfully"
            })

        } catch (error: any) {
            return res.status(500).json({
                error: "Internal server error while converting estimate to project",
                details: error?.message || "Unknown error"
            })
        }
    }
}