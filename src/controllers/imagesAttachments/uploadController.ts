import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";

export class UploadController {
    async handle(req: Request, res: Response) {
        try {
            const {
                projectId,
                estimateId,
                invoiceId,
                title,
                type_images_attachments
            } = req.body;

            const file = req.file;

            // console.log(type_images_attachments);

            if (!file) {
                return res.status(400).json({
                    error: "File is required"
                });
            }

            if (projectId) {
                const project = await prisma.project.findUnique({
                    where: {
                        id: projectId
                    }
                })

                if (!project) {
                    return res.status(400).json({
                        error: "Project not found"
                    });
                }
            }

            if (estimateId) {
                const estimate = await prisma.estimate.findUnique({
                    where: {
                        id: estimateId
                    }
                })

                if (!estimate) {
                    return res.status(400).json({
                        error: "Estimate not found"
                    });
                }
            }

            if (invoiceId) {
                const invoice = await prisma.invoice.findUnique({
                    where: {
                        id: invoiceId
                    }
                })

                if (!invoice) {
                    return res.status(400).json({
                        error: "Invoice not found"
                    });
                }
            }

            if (!projectId && !estimateId && !invoiceId) {
                return res.status(400).json({
                    error: "Project, estimate or invoice is required"
                });
            }

            const fileName = await uploadFileToS3_2(file, '');

            const newImage = await prisma.imagesAttachments.create({
                data: {
                    url: fileName,
                    projectId: projectId,
                    estimateId: estimateId,
                    invoiceId: invoiceId,
                    original_filename: file.originalname,
                    title: title,
                    type_images_attachments: type_images_attachments
                }
            })

            return res.status(201).json({
                success: true,
                message: "Image uploaded successfully",
                data: newImage
            })
        } catch (error) {
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}