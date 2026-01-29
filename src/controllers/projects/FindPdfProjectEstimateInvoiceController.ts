import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class FindPdfProjectEstimateInvoiceController {
    async handle(req: Request, res: Response) {
        try {
            const { estimate_id, invoice_id, project_id, change_order_id } = req.body;

            // Validar se pelo menos um ID foi fornecido
            if (!estimate_id && !invoice_id && !project_id) {
                return res.status(400).json({
                    error: "At least one of estimate_id, invoice_id, or project_id is required"
                });
            }

            // Construir o filtro dinamicamente
            const whereClause: any = {};

            if (estimate_id) {
                whereClause.estimate_id = estimate_id;
            }

            if (invoice_id) {
                whereClause.invoice_id = invoice_id;
            }

            if (project_id) {
                whereClause.project_id = project_id;
            }

            if (change_order_id) {
                whereClause.changeOrderId = change_order_id;
            }

            const pdfProjects = await prisma.pdfProject.findMany({
                where: whereClause,
                orderBy: {
                    date_creation: 'desc'
                }
            });

            // Gerar URLs presignadas para os PDFs
            const formattedResults = await Promise.all(
                pdfProjects.map(async (pdf) => {
                    let presignedUrl = null;

                    if (pdf.uri) {
                        try {
                            presignedUrl = await getPresignedUrl(pdf.uri);
                        } catch (error) {
                        }
                    }

                    return {
                        id: pdf.id,
                        original_file_name: pdf.original_file_name,
                        uri: pdf.uri,
                        presigned_url: presignedUrl,
                        project_id: pdf.project_id,
                        date_creation: pdf.date_creation,
                        date_update: pdf.date_update
                    };
                })
            );

            return res.json({
                success: true,
                data: formattedResults,
                total: formattedResults.length
            });

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal error" });
        }
    }
} 