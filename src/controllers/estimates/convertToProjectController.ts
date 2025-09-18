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
                serviceProjects: true,
                status: true,
                totalAmount: true,
                project: {
                    select: {
                        company_id: true,
                        status_project: true,
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

        const invoices = await prisma.invoice.findMany({
            where: {
                estimateId: estimateId,
                status: "paid"
            },
            select: {
                totalAmount: true
            }
        })

        const totalAmountPaid = invoices.reduce((total, invoice) => {
            return total + Number(invoice.totalAmount)
        }, 0)

        const balanceDue = Number(estimate.totalAmount) - Number(totalAmountPaid) || 0

        try {
            await prisma.$transaction(async (smartbuild) => {
                const project = await smartbuild.project.update({
                    where: {
                        id: estimate.projectId
                    },
                    data: {
                        status_project: "Pre-Start",
                        price: Number(estimate.totalAmount),
                        balanceDue: Number(balanceDue),
                        amountPaid: Number(totalAmountPaid)
                    },
                    select: {
                        contract_number: true
                    }
                })

                await smartbuild.estimate.update({
                    where: {
                        id: estimateId
                    },
                    data: {
                        number: `${project.contract_number}-01`,
                        type_estimate: "estimateProject"
                    }
                })

                if (estimate.serviceProjects.length > 0) {
                    await smartbuild.serviceProject.createMany({
                        data: estimate.serviceProjects.map((service) => ({
                            name: service.name,
                            description: service.description || "",
                            hours: service.hours || 0,
                            price: service.price || 0,
                            id_service: service.id_service || null,
                            projectId: estimate.projectId,
                            company_id: estimate.project.company_id
                        }))
                    })
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
                            data: { type_invoicebase: "project" }
                        })
                    }
                }
            })

            return res.status(200).json({
                message: "Estimate converted to project successfully"
            })

        } catch (error) {
            return res.status(500).json({
                error: "Internal server error while converting estimate to project"
            })
        }
    }
}