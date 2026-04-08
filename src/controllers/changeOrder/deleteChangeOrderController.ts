import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";

export class DeleteChangeOrderController {
    constructor() {
        this.handle = this.handle.bind(this);
    }

    private async deletePdfFromS3(fileKey: string) {
        if (!fileKey) return;

        try {
            await deleteFileFromS3(fileKey);
        } catch (error) {
            console.error(`[deleteChangeOrder] Failed to delete PDF from S3: ${fileKey}`, error);
        }
    }

    async handle(req: Request, res: Response) {
        const { changeOrderId, companyId } = req.params;

        if (!changeOrderId) {
            return res.status(400).json({
                error: "Change order ID is required"
            });
        }

        if (!companyId) {
            return res.status(400).json({
                error: "Company ID is required"
            });
        }

        try {
            const company = await prisma.company.findUnique({
                where: { id: companyId },
                select: { id: true }
            });

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                });
            }

            const changeOrder = await prisma.changeOrder.findUnique({
                where: { id: changeOrderId },
                select: {
                    id: true,
                    status: true,
                    pdfProjects: {
                        select: {
                            id: true,
                            uri: true
                        }
                    },
                    project: {
                        select: {
                            id: true,
                            company_id: true
                        }
                    },
                    estimate: {
                        select: {
                            id: true,
                            project: {
                                select: {
                                    id: true,
                                    company_id: true
                                }
                            }
                        }
                    }
                }
            });

            if (!changeOrder) {
                return res.status(404).json({
                    error: "Change order not found"
                });
            }

            const ownerCompanyId = changeOrder.project?.company_id ?? changeOrder.estimate?.project?.company_id ?? null;

            if (!ownerCompanyId || ownerCompanyId !== companyId) {
                return res.status(403).json({
                    error: "Change order does not belong to this company"
                });
            }

            if (changeOrder.status === "approved") {
                return res.status(400).json({
                    error: "It is not possible to delete an approved change order."
                });
            }

            const pdfKeys = changeOrder.pdfProjects
                .map((pdfProject) => pdfProject.uri)
                .filter((uri): uri is string => Boolean(uri));

            await Promise.all(pdfKeys.map((fileKey) => this.deletePdfFromS3(fileKey)));

            await prisma.changeOrder.delete({
                where: {
                    id: changeOrder.id
                }
            });

            return res.status(200).json({
                message: "Change order deleted successfully"
            });
        } catch (error) {
            console.error("[deleteChangeOrder] Error:", error);
            return res.status(500).json({
                error: "Internal server error while deleting change order"
            });
        }
    }
}
