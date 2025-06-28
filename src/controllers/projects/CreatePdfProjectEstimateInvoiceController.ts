import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import multer from "multer";
import mime from "mime-types";
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
            console.error("Error deleting PDF Project:", error);
            throw error;
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
                    type_pdf 
                } = req.body;

                const file = req.file;

                if (!file) {
                    return res.status(400).json({ error: "PDF file is required" });
                }

                // Validar se o arquivo é um PDF
                const fileMimeType = mime.lookup(file.originalname);
                if (fileMimeType !== "application/pdf") {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "Only PDF files are allowed" });
                }

                // Validar se o estimate existe (se fornecido)
                if (estimate_id) {
                    const estimate = await prisma.estimate.findUnique({
                        where: { id: estimate_id }
                    });
                    if (!estimate) {
                        this.deleteFiles(file.filename);
                        return res.status(404).json({ error: "Estimate not found" });
                    }
                }

                // Validar se o invoice existe (se fornecido)
                if (invoice_id) {
                    const invoice = await prisma.invoice.findUnique({
                        where: { id: invoice_id }
                    });
                    if (!invoice) {
                        this.deleteFiles(file.filename);
                        return res.status(404).json({ error: "Invoice not found" });
                    }
                }

                // Validar se o project existe (se fornecido)
                if (project_id) {
                    const project = await prisma.project.findUnique({
                        where: { id: project_id }
                    });
                    if (!project) {
                        this.deleteFiles(file.filename);
                        return res.status(404).json({ error: "Project not found" });
                    }
                }

                // Upload do arquivo para S3
                const fileName = await uploadFileToS3_2(file, '');

                // Criar o registro no banco
                const result = await prisma.pdfProject.create({
                    data: {
                        original_file_name: file.originalname, 
                        type_pdf: type_pdf,
                        uri: fileName,
                        project_id: project_id || null,
                        estimate_id: estimate_id || null,
                        invoice_id: invoice_id || null,
                    },
                });

                // Limpar arquivo temporário
                this.deleteFiles(file.filename);

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
                console.log(error);
                if (req.file) {
                    this.deleteFiles(req.file.filename);
                }
                if (error instanceof Error) {
                    return res.status(500).json({ error: error.message });
                }
                return res.status(500).json({ error: "Internal error" });
            }
        });
    }
} 