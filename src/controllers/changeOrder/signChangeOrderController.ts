import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";
import { PDFDocument, rgb } from 'pdf-lib';
import nodemailer from "nodemailer";
import { changeOrderApprovedEmail } from "../../templateEmail/changeOrder";

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

                console.log("Valor antigo do estimate:", estimate.totalAmount)

                const createdEstimateServices: string[] = []

                for (const service of changeOrder.changeOrderServices) {
                    const estimateService = await smartbuild.estimateServiceProject.create({
                        data: {
                            name: service.name,
                            description: service.description,
                            quantity: service.quantity,
                            unitPrice: service.unitPrice,
                            lineTotal: service.lineTotal,
                            price: service.price,
                            estimateId: estimate?.id,
                            hours: service.quantity
                        }
                    })

                    createdEstimateServices.push(estimateService.id)
                }

                const newPriceServices = await smartbuild.estimateServiceProject.findMany({
                    where: {
                        estimateId: estimate.id
                    },
                    select: {
                        price: true
                    }
                })

                const newPrice = newPriceServices.reduce((acc, curr) => acc + Number(curr.price), 0)

                await smartbuild.estimate.update({
                    where: {
                        id: estimate.id
                    },
                    data: {
                        totalAmount: newPrice,
                        pdf_needs_update: true
                    }
                })

                console.log("Valor novo do estimate:", newPrice)

                if (estimate.status === "approved") {
                    const project = await smartbuild.project.findUnique({
                        where: {
                            id: estimate.projectId
                        },
                        include: {
                            serviceProject: true,
                        }
                    })

                    if (!project) {
                        return res.status(404).json({
                            error: "Project not found"
                        })
                    }

                    const estimateServicesToCreateInProject = await smartbuild.estimateServiceProject.findMany({
                        where: {
                            id: {
                                in: createdEstimateServices
                            }
                        }
                    })

                    for (const estimateService of estimateServicesToCreateInProject) {
                        await smartbuild.serviceProject.create({
                            data: {
                                name: estimateService.name,
                                description: estimateService.description || "",
                                hours: estimateService.hours || estimateService.quantity,
                                price: estimateService.price || estimateService.lineTotal,
                                projectId: project.id,
                                estimateServiceId: estimateService.id,
                                start_date: estimateService.start_date,
                                deadline: estimateService.deadline,
                                id_service: estimateService.id_service
                            }
                        })
                    }
                }
            })

            const pdfProject = await prisma.pdfProject.findFirst({
                where: {
                    changeOrderId: changeOrder.id
                }
            });

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
                            console.error('Failed to embed signature as PNG or JPG:', pngError, jpgError);
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
                    console.error('Error processing signature:', signatureError);
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

                    const SMTP_CONFIG = require("../../config/smtp");
                    const transporter = nodemailer.createTransport({
                        host: SMTP_CONFIG.host,
                        port: SMTP_CONFIG.port,
                        secure: SMTP_CONFIG.port === 465,
                        auth: {
                            user: SMTP_CONFIG.user,
                            pass: SMTP_CONFIG.pass,
                        },
                        tls: {
                            rejectUnauthorized: false,
                        },
                    });

                    const companyAvatar = company.avatar
                        ? await getPresignedUrl(company.avatar)
                        : "";

                    const clientName = changeOrderWithDetails.estimate?.project?.client?.name || "the client";
                    const changeOrderNumber = changeOrderWithDetails.number?.toString() || changeOrder.id;
                    const estimateNumber = changeOrderWithDetails.estimate?.number || "";
                    const totalAmount = Number(changeOrderWithDetails.total_amount || 0);

                    const mailOptions = {
                        from: SMTP_CONFIG.user,
                        to: companyEmail,
                        subject: `${company.name} - Change Order Approved`,
                        html: changeOrderApprovedEmail(
                            company.name,
                            companyAvatar,
                            company.name,
                            changeOrderNumber,
                            estimateNumber,
                            totalAmount,
                            changeOrder.id,
                            clientName
                        ),
                        text: `
Dear ${company.name},

Great news! The change order you sent to ${clientName} has been approved.

Change Order: ${changeOrderNumber}
Estimate: ${estimateNumber}
Additional Amount: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalAmount)}

The client has reviewed and accepted the additional work scope and costs.

Have a great day!
${company.name}
                        `.trim()
                    };

                    await transporter.sendMail(mailOptions);
                    console.log(`✅ Email sent to company: ${companyEmail}`);
                }
            } catch (emailError) {
                console.error('❌ Error sending approval email to company:', emailError);
            }

            return res.status(200).json({
                message: "Change order signed successfully"
            })
        } catch (error) {
            console.error('Error signing change order:', error);
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}