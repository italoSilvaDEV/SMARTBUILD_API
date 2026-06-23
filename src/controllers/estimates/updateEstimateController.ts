import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { buildEstimateFinancialFields } from "../../utils/estimateDiscount";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";
import { fireAndForgetUpsertEstimateToQBO } from "../quickbooks/estimate/QuickBooksEstimateOutboundService";

type Fields = {
    client?: {
        email?: string
        id?: string
        name?: string
        phone?: string | null
    }
    description?: string | null
    terms?: string | null
    totalAmount?: number
    multi_emails?: string | null
    date_creation?: Date
    discountType?: "fixed" | "percentage" | null
    discountValue?: number | null
    location?: {
        address?: string
        lat?: string
        lng?: string
        radius?: string
    }
    workContextId?: string | null
}

const DISCOUNT_ERRORS = new Set([
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
]);

export class UpdateEstimateFieldsController {
    async handle(req: Request, res: Response) {
        const {
            estimateId,
            description,
            terms,
            totalAmount,
            multi_emails,
            date_creation,
            discountType,
            discountValue,
            client,
            location,
            workContextId,
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
            include: {
                serviceProjects: {
                    orderBy: [
                        { pos: "asc" },
                        { date_creation: "asc" },
                        { id: "asc" },
                    ],
                    select: {
                        quantity: true,
                        unitPrice: true,
                        lineTotal: true,
                        originalUnitPrice: true,
                        originalLineTotal: true,
                    }
                },
                project: {
                    select: {
                        id: true,
                        company_id: true,
                        client_id: true,
                        workContextId: true,
                    }
                }
            }
        })

        if (!estimate) {
            return res.status(404).json({
                error: "Estimate not found"
            })
        }

        const hasAnyField = [description, terms, totalAmount, multi_emails, date_creation, discountType, discountValue, client, location, workContextId]
            .some(value => value !== undefined)

        if (!hasAnyField) {
            return res.status(400).json({
                error: "At least one field must be provided"
            })
        }

        try {
            const campos: Fields = {}

            if (description !== undefined) {
                campos.description = description === "" ? null : description
            }

            if (date_creation !== undefined && date_creation !== null) {
                campos.date_creation = new Date(date_creation)
            }

            if (terms !== undefined) {
                campos.terms = terms === "" ? null : terms
            }

            if (totalAmount !== undefined) {
                campos.totalAmount = Number(totalAmount)
            }

            if (multi_emails !== undefined) {
                campos.multi_emails = multi_emails === "" ? null : multi_emails
            }

            if (discountType !== undefined) {
                campos.discountType = discountType
            }

            if (discountValue !== undefined) {
                campos.discountValue = discountValue === null || discountValue === "" ? null : Number(discountValue)
            }

            if (client !== undefined) {
                campos.client = client
            }

            if (location !== undefined) {
                campos.location = location
            }

            if (workContextId !== undefined) {
                campos.workContextId = workContextId || null
            }

            const updateProjectContext = async (smartbuild: any) => {
                if (!estimate.project?.id) return

                const projectData: any = {}
                const nextClientId = campos.client?.id || estimate.project.client_id
                const nextWorkContextId =
                    campos.workContextId !== undefined
                        ? campos.workContextId
                        : estimate.project.workContextId

                if (campos.client?.id) {
                    const existingClient = await smartbuild.client.findFirst({
                        where: {
                            id: campos.client.id,
                            company_id: estimate.project.company_id,
                        },
                        select: { id: true }
                    })

                    if (!existingClient) {
                        throw new Error("Client not found")
                    }

                    projectData.client_id = existingClient.id
                }

                if ((campos.client || campos.location) && !nextWorkContextId) {
                    throw new Error("workContextId is required")
                }

                if (nextWorkContextId) {
                    const existingWorkContext = await smartbuild.workContext.findFirst({
                        where: {
                            clientId: nextClientId,
                            id: nextWorkContextId,
                        },
                        select: { id: true }
                    })

                    if (!existingWorkContext) {
                        throw new Error("Work context not found for this client")
                    }
                }

                if (campos.location) {
                    if (campos.location.address !== undefined) projectData.location = campos.location.address
                    if (campos.location.lat !== undefined) projectData.lat = campos.location.lat
                    if (campos.location.lng !== undefined) projectData.log = campos.location.lng
                    if (campos.location.radius !== undefined) projectData.radius = Number(campos.location.radius || 100)
                }

                if (campos.workContextId !== undefined) {
                    projectData.workContextId = campos.workContextId
                }

                if (Object.keys(projectData).length > 0) {
                    await smartbuild.project.update({
                        where: { id: estimate.project.id },
                        data: projectData,
                    })
                }
            }

            let updatedEstimate: any

            if (estimate.serviceProjects.length > 0) {
                updatedEstimate = await prisma.$transaction(async (smartbuild) => {
                    await updateProjectContext(smartbuild)

                    await smartbuild.estimate.update({
                        where: {
                            id: estimateId
                        },
                        data: {
                            ...(campos.description !== undefined ? { description: campos.description } : {}),
                            ...(campos.terms !== undefined ? { terms: campos.terms } : {}),
                            ...(campos.multi_emails !== undefined ? { multi_emails: campos.multi_emails } : {}),
                            ...(campos.date_creation !== undefined ? { date_creation: campos.date_creation } : {}),
                            ...(campos.discountType !== undefined ? { discountType: campos.discountType } : {}),
                            ...(campos.discountValue !== undefined ? { discountValue: campos.discountValue } : {}),
                        }
                    })

                    await syncEstimateDiscountedServices(smartbuild, estimateId)

                    return smartbuild.estimate.findUnique({
                        where: { id: estimateId }
                    })
                })
            } else {
                const subtotal = campos.totalAmount !== undefined ? campos.totalAmount : Number(estimate.totalAmount)
                const financialFields = buildEstimateFinancialFields({
                    subtotal,
                    amountPaid: estimate.amountPaid,
                    discountType: campos.discountType !== undefined ? campos.discountType : (estimate as any).discountType,
                    discountValue: campos.discountValue !== undefined ? campos.discountValue : (estimate as any).discountValue,
                })

                updatedEstimate = await prisma.$transaction(async (smartbuild) => {
                    await updateProjectContext(smartbuild)

                    return smartbuild.estimate.update({
                    where: {
                        id: estimateId
                    },
                    data: {
                        ...(campos.description !== undefined ? { description: campos.description } : {}),
                        ...(campos.terms !== undefined ? { terms: campos.terms } : {}),
                        ...(campos.multi_emails !== undefined ? { multi_emails: campos.multi_emails } : {}),
                        ...(campos.date_creation !== undefined ? { date_creation: campos.date_creation } : {}),
                        totalAmount: financialFields.totalAmount,
                        balanceDue: financialFields.balanceDue,
                        discountType: financialFields.discountType,
                        discountValue: financialFields.discountValue,
                        discountAmount: financialFields.discountAmount,
                        finalAmount: financialFields.finalAmount,
                    }
                    })
                })
            }

            fireAndForgetUpsertEstimateToQBO(estimate.project?.company_id, (req as any).userId, estimateId);

            return res.status(200).json({
                message: "Estimate fields updated successfully",
                data: updatedEstimate
            })
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

            if (error?.message === "workContextId is required" || error?.message === "Work context not found for this client") {
                return res.status(400).json({ error: error.message })
            }

            return res.status(500).json({
                error: "Internal server error while updating estimate fields"
            })
        }
    }
}

