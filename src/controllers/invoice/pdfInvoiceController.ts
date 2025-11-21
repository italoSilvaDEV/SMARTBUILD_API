import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";

export class PdfInvoicePaidController {
    async create(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.body

        const file = req.file

        if (!invoiceId || !file) {
            return res.status(400).json({
                error: "Invoice ID and file are required"
            })
        }

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true
                }
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            const existingPdf = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    invoiceId: invoiceId
                }
            })

            if (existingPdf && existingPdf.uri) {
                await deleteFileFromS3(existingPdf.uri);
            }

            const newFileName = await uploadFileToS3_2(file, '');

            const newPdf = await prisma.pdfInvoicePaid.create({
                data: {
                    original_file_name: file.originalname,
                    uri: newFileName,
                    invoiceId: invoiceId
                },
            })

            return res.status(200).json({
                message: "PDF created successfully",
                data: newPdf
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async update(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.body

        const file = req.file

        if (!invoiceId || !file) {
            return res.status(400).json({
                error: "Invoice ID and file are required"
            })
        }

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true
                }
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            const existingPdf = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    invoiceId: invoiceId
                }
            })

            if (!existingPdf) {
                return res.status(404).json({
                    error: "PDF not found"
                })
            }

            if (existingPdf.uri) {
                await deleteFileFromS3(existingPdf.uri);
            }

            const newFileName = await uploadFileToS3_2(file, '');

            const updatedPdf = await prisma.pdfInvoicePaid.update({
                where: {
                    id: existingPdf.id
                },
                data: {
                    original_file_name: file.originalname,
                    uri: newFileName
                }
            })

            return res.status(200).json({
                message: "PDF updated successfully",
                data: updatedPdf
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async delete(req: Request, res: Response) {
        const {
            pdfId,
        } = req.params

        if (!pdfId) {
            return res.status(400).json({
                error: "PDF ID is required"
            })
        }

        try {
            const existingPdf = await prisma.pdfInvoicePaid.findUnique({
                where: {
                    id: pdfId
                }
            })

            if (!existingPdf) {
                return res.status(404).json({
                    error: "PDF not found"
                })
            }

            if (existingPdf.uri) {
                await deleteFileFromS3(existingPdf.uri);
            }

            await prisma.pdfInvoicePaid.delete({
                where: {
                    id: pdfId
                }
            })

            return res.status(200).json({
                message: "PDF deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }

    async setChecked(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.body

        if (!invoiceId) {
            return res.status(400).json({
                error: "Invoice ID is required"
            })
        }

        try {
            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
                select: {
                    id: true
                }
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            await prisma.invoice.update({
                where: {
                    id: invoiceId
                },
                data: {
                    checked: true
                }
            })

            return res.status(200).json({
                message: "Invoice checked successfully",
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}