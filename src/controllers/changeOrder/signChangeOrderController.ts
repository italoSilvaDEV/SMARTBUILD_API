import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { PDFDocument, rgb } from 'pdf-lib';
import { sendEmail } from "../../utils/sendEmail";
import { changeOrderApprovedEmail } from "../../templateEmail/changeOrderApproved";

export class SignChangeOrderController {
    async handle(req: Request, res: Response) {
        const {
            changeOrderId,
            signature
        } = req.body

        try {
            if (!changeOrderId) {
                return res.status(404).json({
                    error: "Change order ID is required"
                })
            }

            const changeOrder = await prisma.changeOrder.findUnique({
                where: {
                    id: changeOrderId
                },
                select: {
                    id: true,
                    status: true,
                    estimateId: true,
                    changeOrderServices: true,
                    pdfProjects: true,
                    date_creation: true,
                }
            })

            if (!changeOrder) {
                return res.status(404).json({
                    error: "Change order not found"
                })
            }

            await prisma.$transaction(async (smartbuild) => {
                await smartbuild.changeOrder.update({
                    where: {
                        id: changeOrder.id
                    },
                    data: {
                        status: "approved"
                    }
                })

                const estimate = await smartbuild.estimate.findUnique({
                    where: {
                        id: changeOrder.estimateId
                    },
                    include: {
                        serviceProjects: true,
                        project: true,
                    }
                })

                if (!estimate) {
                    return res.status(404).json({
                        error: "Estimate not found"
                    })
                }


            if (!pdfProject || !pdfProject.uri) {
                return res.status(404).json({
                    error: "PDF Project not found or has no URI"
                });
            }

            const pdfUrl = await getPresignedUrl(pdfProject.uri);

            const pdfResponse = await fetch(pdfUrl);
            if (!pdfResponse.ok) {
                throw new Error(`Failed to fetch PDF: ${pdfResponse.statusText}`);
            }
            const originalPdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());

            const pdfDoc = await PDFDocument.load(originalPdfBuffer);
            const pages = pdfDoc.getPages();

            if (signature) {
                try {
                    const base64Data = signature.replace(/^data:image\/[a-z]+;base64,/, '');
                    const signatureBuffer = Buffer.from(base64Data, 'base64');

                    let signatureImage;
                    try {
                        signatureImage = await pdfDoc.embedPng(signatureBuffer);
                    } catch (pngError) {
                        try {
                            signatureImage = await pdfDoc.embedJpg(signatureBuffer);
                        } catch (jpgError) {
                            throw new Error('Invalid signature image format');
                        }
                    }

                    const signatureWidth = 100;
                    const signatureHeight = 35;

                    const page = pages[0];
                    const { width, height } = page.getSize();

                    const x = 95;
                    const y = 625;

                    page.drawImage(signatureImage, {
                        x,
                        y,
                        width: signatureWidth,
                        height: signatureHeight,
                    });
                } catch (signatureError) {
                }
            }
            const modifiedPdfBytes = await pdfDoc.save();
            const modifiedPdfBuffer = Buffer.from(modifiedPdfBytes);

            const s3 = new S3Client({
                region: process.env.AMAZON_S3_REGION,
                credentials: {
                    accessKeyId: process.env.AMAZON_S3_KEY!,
                    secretAccessKey: process.env.AMAZON_S3_SECRET!,
                },
            });

            const fileHash = crypto.randomBytes(4).toString("hex");
            const originalFileName = pdfProject.original_file_name || `change_order_${changeOrder.id}.pdf`;
            const newFileName = `${fileHash}-${originalFileName.replace(/\s/g, "")}`;

            const putObjectCommand = new PutObjectCommand({
                Bucket: process.env.AMAZON_S3_BUCKET!,
                Key: newFileName,
                Body: modifiedPdfBuffer,
                ContentType: 'application/pdf',
            });

            await s3.send(putObjectCommand);

            await prisma.pdfProject.update({
                where: { id: pdfProject.id },
                data: {
                    uri: newFileName
                }
            });

            // Enviar email para a company quando o change order for aceito
            try {
                const changeOrderWithDetails = await prisma.changeOrder.findUnique({
                    where: { id: changeOrder.id },
                    include: {
                        estimate: {
                            include: {
                                project: {
                                    include: {
                                        client: true,
                                        workContext: true,
                                        company: true
                                    }
                                }
                            }
                        }
                    }
                });

                if (changeOrderWithDetails?.estimate?.project?.company?.email) {
                    const company = changeOrderWithDetails.estimate.project.company;
                    const companyEmail = company.email;

                    if (!companyEmail) {
                        return;
                    }

                    const project = changeOrderWithDetails.estimate?.project;
                    const clientName = project?.workContext?.Name || project?.client?.name || "Client";
                    const changeOrderNumber = changeOrderWithDetails.number?.toString() || changeOrder.id;
                    const estimateNumber = changeOrderWithDetails.estimate?.number || "";
                    const totalAmount = Number(changeOrderWithDetails.total_amount || 0);
                    
                    const formattedAmount = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                    }).format(totalAmount);

                    const emailSubject = `APPROVED: Change Order #${changeOrderNumber} added +${formattedAmount} to Estimate`;

                    await sendEmail({
                        to: companyEmail,
                        subject: emailSubject,
                        html: changeOrderApprovedEmail(
                            clientName,
                            company.name,
                            changeOrderNumber,
                            estimateNumber,
                            totalAmount,
                            changeOrder.id,
                            companyEmail,
                            project.id
                        ),
                    });
                }
            } catch (emailError) {
            }

            return res.status(200).json({
                message: "Change order signed successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}