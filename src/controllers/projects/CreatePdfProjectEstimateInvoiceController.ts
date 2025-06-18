import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import multer from "multer";
import mime from "mime-types";

const upload = multer({ dest: './public/tmp/pdfproject' }).single('file');

export class CreatePdfProjectEstimateInvoiceController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/pdfproject/${file}`);
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

                // Validar se pelo menos um ID foi fornecido
                if (!estimate_id && !invoice_id && !project_id) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ 
                        error: "At least one of estimate_id, invoice_id, or project_id is required" 
                    });
                }

                // Validar se apenas um tipo de relacionamento foi fornecido
                const relationshipCount = [estimate_id, invoice_id, project_id].filter(Boolean).length;
                if (relationshipCount > 1) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ 
                        error: "Only one relationship (estimate_id, invoice_id, or project_id) can be provided at a time" 
                    });
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