import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import multer from "multer";
import S3Storage from "../../utils/S3/s3Storage";

const upload = multer({ dest: './public/tmp/pdfinvoice' }).single('file');

export class updatePdfInvoiceController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
        this.deleteFilesFromS3 = this.deleteFilesFromS3.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/pdfestimate/${file}`);
    }

    async deleteFilesFromS3(file: string) {
        const s3 = new S3Storage();
        await s3.deleteFile(file);
    }

    async handle(req: Request, res: Response) {
        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: 'Error uploading file' });
            }

            try {
                const {
                    invoiceId
                } = req.body;

                const file = req.file;

                if (!invoiceId) {
                    if (file) this.deleteFiles(file.filename);

                    return res.status(400).json({
                        error: "Invoice ID is required"
                    });
                }

                if (!file) {
                    return res.status(400).json({ error: "PDF file is required" });
                }

                if (!file.originalname.toLowerCase().endsWith('.pdf')) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "Only PDF files are allowed" });
                }

                const invoice = await prisma.invoice.findUnique({
                    where: { id: invoiceId },
                    select: { id: true }
                });

                if (!invoice) {
                    this.deleteFiles(file.filename);
                    return res.status(404).json({
                        error: "Invoice not found"
                    });
                }

                const existingPdf = await prisma.pdfProject.findFirst({
                    where: {
                        invoice_id: invoiceId
                    }
                });

                if (!existingPdf) {
                    this.deleteFiles(file.filename);
                    return res.status(404).json({
                        error: "PDF not found for this invoice"
                    });
                }

                const newFileName = await uploadFileToS3_2(file, '');

                if (existingPdf.uri) {
                    try {
                        await this.deleteFilesFromS3(existingPdf.uri);
                    } catch (error) {
                        console.error("Error deleting old file from S3:", error);
                    }
                }

                const updatedPdf = await prisma.pdfProject.update({
                    where: {
                        id: existingPdf.id
                    },
                    data: {
                        original_file_name: file.originalname,
                        uri: newFileName,
                        date_update: new Date()
                    },
                    select: {
                        id: true,
                        original_file_name: true,
                        uri: true,
                        type_pdf: true,
                        invoice_id: true,
                        date_creation: true,
                        date_update: true
                    }
                });

                setImmediate(() => {
                    this.deleteFiles(file.filename);
                });

                return res.status(200).json({
                    message: "PDF updated successfully",
                    data: updatedPdf
                });

            } catch (error) {
                console.error("Error updating PDF:", error);
                if (req.file) {
                    setImmediate(() => {
                        this.deleteFiles(req.file!.filename);
                    });
                }
                if (error instanceof Error) {
                    return res.status(500).json({ error: error.message });
                }
                return res.status(500).json({ error: "Internal server error" });
            }
        });
    }
}