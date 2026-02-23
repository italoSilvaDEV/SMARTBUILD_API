import { prisma } from "../../utils/prisma";
import { Request, Response } from "express";
import { deleteFile } from "../../config/file";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import multer from "multer";
import S3Storage from "../../utils/S3/s3Storage";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { addCompanySignatureToPdfBuffer } from "../../utils/pdfEstimateSignatures";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const upload = multer({ dest: './public/tmp/pdfestimate' }).single('file');

export class updatePdfEstimateController {
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
                    estimateId,
                    templateNumber
                } = req.body;

                const file = req.file;

                if (!estimateId) {
                    if (file) this.deleteFiles(file.filename);

                    return res.status(400).json({
                        error: "Estimate ID is required"
                    });
                }

                if (!file) {
                    return res.status(400).json({ error: "PDF file is required" });
                }

                if (!file.originalname.toLowerCase().endsWith('.pdf')) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "Only PDF files are allowed" });
                }

                const estimate = await prisma.estimate.findUnique({
                    where: { id: estimateId },
                    select: { id: true }
                });

                if (!estimate) {
                    this.deleteFiles(file.filename);
                    return res.status(404).json({
                        error: "Estimate not found"
                    });
                }

                const existingPdf = await prisma.pdfProject.findFirst({
                    where: {
                        estimate_id: estimateId
                    }
                });

                if (!existingPdf) {
                    this.deleteFiles(file.filename);
                    return res.status(404).json({
                        error: "PDF not found for this estimate"
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
                        date_update: new Date(),
                        templateNumber: templateNumber ? Number(templateNumber) : existingPdf.templateNumber
                    },
                    select: {
                        id: true,
                        original_file_name: true,
                        uri: true,
                        type_pdf: true,
                        estimate_id: true,
                        date_creation: true,
                        date_update: true
                    }
                });

                setImmediate(() => {
                    this.deleteFiles(file.filename);
                });

                try {
                    if (updatedPdf.uri) {
                        const estimateWithCompany = await prisma.estimate.findUnique({
                            where: { id: estimateId },
                            select: { number: true, project: { select: { company: { select: { name: true } } } } }
                        });
                        const companyName = estimateWithCompany?.project?.company?.name || "Company";

                        const pdfUrl = await getPresignedUrl(updatedPdf.uri);
                        const pdfResponse = await fetch(pdfUrl);
                        if (pdfResponse.ok) {
                            const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
                            const signedPdfBuffer = await addCompanySignatureToPdfBuffer(
                                originalPdfBuffer,
                                companyName,
                                new Date()
                            );
                            const s3 = new S3Client({
                                region: process.env.AMAZON_S3_REGION,
                                credentials: {
                                    accessKeyId: process.env.AMAZON_S3_KEY!,
                                    secretAccessKey: process.env.AMAZON_S3_SECRET!
                                }
                            });
                            const fileHash = crypto.randomBytes(4).toString("hex");
                            const baseName = updatedPdf.original_file_name || `estimate_${estimateWithCompany?.number ?? estimateId}.pdf`;
                            const finalFileName = `${fileHash}-${baseName.replace(/\s/g, "")}`;
                            await s3.send(new PutObjectCommand({
                                Bucket: process.env.AMAZON_S3_BUCKET!,
                                Key: finalFileName,
                                Body: signedPdfBuffer,
                                ContentType: "application/pdf"
                            }));
                            await prisma.pdfProject.update({
                                where: { id: updatedPdf.id },
                                data: { uri: finalFileName }
                            });
                        }
                    }
                } catch (pdfErr) {
                    console.error("[updatePdfEstimate] Error adding company signature to PDF:", pdfErr);
                }

                const dataToReturn = await prisma.pdfProject.findUnique({
                    where: { id: updatedPdf.id },
                    select: {
                        id: true,
                        original_file_name: true,
                        uri: true,
                        type_pdf: true,
                        estimate_id: true,
                        date_creation: true,
                        date_update: true
                    }
                });

                return res.status(200).json({
                    message: "PDF updated successfully",
                    data: dataToReturn ?? updatedPdf
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