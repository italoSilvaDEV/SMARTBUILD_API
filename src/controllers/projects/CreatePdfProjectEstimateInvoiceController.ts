import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import multer from "multer";
import S3Storage from "../../utils/S3/s3Storage";

const upload = multer({ dest: './public/tmp/pdfproject' }).single('file');

export class CreatePdfProjectEstimateInvoiceController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
        this.deletePdfProject = this.deletePdfProject.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/pdfproject/${file}`);
    }

    async deleteFilesFromS3(file: string) {
        const s3 = new S3Storage();
        await s3.deleteFile(file);
    }

    async deletePdfProject(idPdfProject: string) {
        try {
            // Buscar o PdfProject
            const pdfProject = await prisma.pdfProject.findUnique({
                where: { id: idPdfProject }
            });

            if (!pdfProject) {
                throw new Error("PDF Project not found");
            }

            // Excluir o arquivo do S3 se existir
            if (pdfProject.uri) {
                await this.deleteFilesFromS3(pdfProject.uri);
            }

            // Excluir o registro do banco
            await prisma.pdfProject.delete({
                where: { id: idPdfProject }
            });

            return { success: true, message: "PDF Project deleted successfully" };
        } catch (error) {
            throw error;
        }
    }

    async update(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const {
                invoiceId,
                projectId,
            } = req.body;

            if (!id) {
                return res.status(400).json({ error: "PDF Project ID is required" });
            }

            // Primeiro verificar se o PDF Project existe
            const existingPdfProject = await prisma.pdfProject.findUnique({
                where: { id },
                select: { id: true, uri: true, original_file_name: true }
            });

            if (!existingPdfProject) {
                return res.status(404).json({ error: "PDF Project not found" });
            }





            // Atualizar o registro no banco
            const updatedPdfProject = await prisma.pdfProject.updateMany({
                where: { id: existingPdfProject.id },
                data: {
                    project_id: projectId,
                    invoice_id: invoiceId,
                    date_update: new Date()
                },
            });



            return res.json(updatedPdfProject);

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal error" });
        }
    }

    async handle(req: Request, res: Response) {
        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: 'Error uploading file' });
            }

            try {
                const {
                    estimate_id,
                    invoice_id,
                    project_id,
                    change_order_id,
                    type_pdf,
                    templateNumber
                } = req.body;

                const file = req.file;

                if (!file) {
                    return res.status(400).json({ error: "PDF file is required" });
                }

                // Validar se o arquivo é um PDF (verificação mais rápida)
                if (!file.originalname.toLowerCase().endsWith('.pdf')) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "Only PDF files are allowed" });
                }

                // Paralelizar todas as validações de existência
                const validationPromises = [];

                if (estimate_id) {
                    validationPromises.push(
                        prisma.estimate.findUnique({
                            where: { id: estimate_id },
                            select: { id: true }
                        }).then(result => ({ type: 'estimate', exists: !!result }))
                    );
                }

                if (invoice_id) {
                    validationPromises.push(
                        prisma.invoice.findUnique({
                            where: { id: invoice_id },
                            select: { id: true }
                        }).then(result => ({ type: 'invoice', exists: !!result }))
                    );
                }

                if (project_id) {
                    validationPromises.push(
                        prisma.project.findUnique({
                            where: { id: project_id },
                            select: { id: true }
                        }).then(result => ({ type: 'project', exists: !!result }))
                    );
                }

                if (change_order_id) {
                    validationPromises.push(
                        prisma.changeOrder.findUnique({
                            where: { id: change_order_id },
                            select: { id: true }
                        }).then(result => ({ type: 'change_order', exists: !!result }))
                    );
                }

                // Executar todas as validações em paralelo
                if (validationPromises.length > 0) {
                    const validationResults = await Promise.all(validationPromises);

                    for (const result of validationResults) {
                        if (!result.exists) {
                            this.deleteFiles(file.filename);
                            return res.status(404).json({
                                error: `${result.type.charAt(0).toUpperCase() + result.type.slice(1)} not found`
                            });
                        }
                    }
                }

                // Paralelizar upload para S3 e criação do registro no banco
                const [fileName, _] = await Promise.all([
                    uploadFileToS3_2(file, ''),
                    // Adicionar uma promise vazia para manter a estrutura, ou outra operação paralela se necessário
                    Promise.resolve()
                ]);

                const templateNumberInt = parseInt(templateNumber || '1');

                // Criar o registro no banco
                const result = await prisma.pdfProject.create({
                    data: {
                        original_file_name: file.originalname,
                        type_pdf: type_pdf,
                        uri: fileName,
                        project_id: project_id || null,
                        estimate_id: estimate_id || null,
                        invoice_id: invoice_id || null,
                        changeOrderId: change_order_id || null,
                        templateNumber: templateNumberInt,
                    },
                    select: {
                        id: true,
                        original_file_name: true,
                        uri: true,
                        project_id: true,
                        date_creation: true
                    }
                });

                // Limpar arquivo temporário de forma não-bloqueante
                setImmediate(() => {
                    this.deleteFiles(file.filename);
                });

                const formattedResult = {
                    id: result.id,
                    original_file_name: result.original_file_name,
                    uri: result.uri,
                    type_pdf: type_pdf,
                    project_id: result.project_id,
                    date_creation: result.date_creation
                };

                return res.json(formattedResult);

            } catch (error) {
                if (req.file) {
                    // Limpeza não-bloqueante em caso de erro
                    setImmediate(() => {
                        this.deleteFiles(req.file!.filename);
                    });
                }
                if (error instanceof Error) {
                    return res.status(500).json({ error: error.message });
                }
                return res.status(500).json({ error: "Internal error" });
            }
        });
    }

    async updateEstimateId(req: Request, res: Response) {
        const {
            pdfId,
            estimateId
        } = req.body

        if (!pdfId) {
            return res.status(400).json({
                error: "PDF ID NOT FOUND"
            })
        }

        const pdf = await prisma.pdfProject.findUnique({
            where: {
                id: pdfId
            }
        })

        if (!pdf) {
            return res.status(404).json({
                error: "PDF NOT FOUND"
            })
        }

        try {
            const updated = await prisma.pdfProject.update({
                where: {
                    id: pdfId
                },
                data: {
                    estimate_id: estimateId
                }
            })

            return res.status(200).json({
                message: "Estimate ID updated successfully",
                data: updated
            })

        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
} 