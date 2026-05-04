import { TypeEstimate } from "@prisma/client";
import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { addCompanySignatureToPdfBuffer, addCompanySignatureImageToPdfBuffer } from "../../utils/pdfEstimateSignatures";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { buildEstimateFinancialFields, EstimateDiscountType } from "../../utils/estimateDiscount";
import { syncEstimateDiscountedServices } from "../../utils/estimateDiscountSync";

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
    cancelEstimates?: boolean;
    isProjectFlow?: boolean;
    isStandaloneEstimate?: boolean;
    discountType?: EstimateDiscountType;
    discountValue?: number | null;
}

const DISCOUNT_ERRORS = new Set([
    "Percentage discount cannot be greater than 100",
    "Fixed discount cannot be greater than estimate subtotal",
]);

export class CreateNewEstimateController {
    async handle(req: Request, res: Response) {
        const payloadCreateEstimate = req.body as payloadCreateEstimate

        if (!payloadCreateEstimate.projectId ||
            !payloadCreateEstimate.idPdfProject ||
            !payloadCreateEstimate.preGeneratedNumber ||
            payloadCreateEstimate.totalAmount === undefined ||
            payloadCreateEstimate.totalAmount === null ||
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
                id: true,
                company_id: true,
            }
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
            })
        }

        try {
            const result = await prisma.$transaction(async (smartbuild) => {
                const financialFields = buildEstimateFinancialFields({
                    subtotal: Number(payloadCreateEstimate.totalAmount),
                    amountPaid: 0,
                    discountType: payloadCreateEstimate.discountType,
                    discountValue: payloadCreateEstimate.discountValue,
                });

                const createEstimate = await smartbuild.estimate.create({
                    data: {
                        number: payloadCreateEstimate.preGeneratedNumber,
                        approvedAt: payloadCreateEstimate.approvedAt,
                        totalAmount: Number(financialFields.totalAmount),
                        balanceDue: Number(financialFields.balanceDue),
                        amountPaid: 0,
                        discountType: financialFields.discountType,
                        discountValue: financialFields.discountValue,
                        discountAmount: financialFields.discountAmount,
                        finalAmount: financialFields.finalAmount,
                        description: payloadCreateEstimate.description,
                        terms: payloadCreateEstimate.terms,
                        status: payloadCreateEstimate.status,
                        type_estimate: payloadCreateEstimate.type_estimate,
                        assignatureRequired: payloadCreateEstimate.type_estimate === "estimateProject" && payloadCreateEstimate.isProjectFlow ? true : false,
                        multi_emails: payloadCreateEstimate.multi_emails,
                        isStandaloneEstimate: payloadCreateEstimate.isStandaloneEstimate || false,
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

                    if (Object.keys(updateData).length > 0) {
                        await smartbuild.project.update({
                            where: {
                                id: payloadCreateEstimate.projectId
                            },
                            data: updateData,
                        })
                    }

                    if (payloadCreateEstimate.isProjectFlow) {
                        const projectServices = await smartbuild.serviceProject.findMany({
                            where: {
                                projectId: payloadCreateEstimate.projectId
                            },
                            orderBy: {
                                date_creation: "asc",
                            },
                            select: {
                                id: true,
                                name: true,
                                description: true,
                                hours: true,
                                price: true,
                                id_service: true,
                                start_date: true,
                                deadline: true,
                            }
                        })

                        for (const projectService of projectServices) {
                            const originalUnitPrice = Number(projectService.price ?? 0)
                            const quantity = Number(projectService.hours ?? 1)
                            const originalLineTotal = Number((originalUnitPrice * quantity).toFixed(2))

                            await smartbuild.estimateServiceProject.create({
                                data: {
                                    name: projectService.name,
                                    description: projectService.description,
                                    quantity,
                                    unitPrice: originalUnitPrice,
                                    lineTotal: originalLineTotal,
                                    originalUnitPrice,
                                    originalLineTotal,
                                    estimateId: createEstimate.id,
                                    id_service: projectService.id_service,
                                    hours: projectService.hours,
                                    price: projectService.price,
                                    start_date: projectService.start_date,
                                    deadline: projectService.deadline,
                                    serviceProject: {
                                        connect: {
                                            id: projectService.id
                                        }
                                    }
                                }
                            })
                        }

                        await syncEstimateDiscountedServices(smartbuild, createEstimate.id)
                    }
                } else {
                    const updateData: any = {
                        price: Number(financialFields.totalAmount),
                        balanceDue: Number(financialFields.balanceDue) || 0
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
                        project_id: payloadCreateEstimate.projectId,
                        estimate_id: createEstimate.id,
                    }
                })

                const finalEstimate = await smartbuild.estimate.findUnique({
                    where: { id: createEstimate.id }
                })

                return { createEstimate: finalEstimate ?? createEstimate, idPdfProject: payloadCreateEstimate.idPdfProject };
            });

            const { createEstimate, idPdfProject } = result;

            const pdfProject = await prisma.pdfProject.findUnique({
                where: { id: idPdfProject },
                select: { id: true, uri: true, original_file_name: true }
            });
            const projectWithCompany = await prisma.project.findUnique({
                where: { id: payloadCreateEstimate.projectId },
                select: { company: { select: { name: true, signature: true } } }
            });
            const companyName = projectWithCompany?.company?.name || "Company";
            const companySignature = projectWithCompany?.company?.signature;

            if (pdfProject?.uri) {
                try {
                    const pdfUrl = await getPresignedUrl(pdfProject.uri);
                    const pdfResponse = await fetch(pdfUrl);
                    if (pdfResponse.ok) {
                        const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                        const signedPdfBuffer = companySignature
                            ? await addCompanySignatureImageToPdfBuffer(originalPdfBuffer, companySignature, companyName)
                            : await addCompanySignatureToPdfBuffer(originalPdfBuffer, companyName, new Date());
                        const s3 = new S3Client({
                            region: process.env.AMAZON_S3_REGION,
                            credentials: {
                                accessKeyId: process.env.AMAZON_S3_KEY!,
                                secretAccessKey: process.env.AMAZON_S3_SECRET!
                            }
                        });
                        const fileHash = crypto.randomBytes(4).toString("hex");
                        const baseName = pdfProject.original_file_name || `estimate_${createEstimate.number}.pdf`;
                        const newFileName = `${fileHash}-${baseName.replace(/\s/g, "")}`;
                        await s3.send(new PutObjectCommand({
                            Bucket: process.env.AMAZON_S3_BUCKET!,
                            Key: newFileName,
                            Body: signedPdfBuffer,
                            ContentType: "application/pdf"
                        }));
                        await prisma.pdfProject.update({
                            where: { id: pdfProject.id },
                            data: { uri: newFileName }
                        });
                    }
                } catch (pdfErr) {
                    console.error("[createNewEstimate] Error adding company signature to PDF:", pdfErr);
                }
            }

            return res.status(201).json({
                message: "Estimate created successfully",
                data: createEstimate
            });
        } catch (error: any) {
            if (DISCOUNT_ERRORS.has(error?.message)) {
                return res.status(400).json({ error: error.message })
            }

            return res.status(500).json({
                error: "Internal server error while creating new estimate"
            })
        }
    }
}

