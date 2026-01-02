import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetDocumentsController {
    async handle(req: Request, res: Response) {
        const {
            invoiceId,
        } = req.params

        try {
            if (!invoiceId) {
                return res.status(400).json({
                    error: "Invoice ID is required"
                })
            }

            const invoice = await prisma.invoice.findUnique({
                where: {
                    id: invoiceId
                },
            })

            if (!invoice) {
                return res.status(404).json({
                    error: "Invoice not found"
                })
            }

            const imagesAttachments = await prisma.imagesAttachments.findMany({
                where: {
                    invoiceId: invoiceId,
                    type_images_attachments: "document"
                }
            })

            const imagesAttachmentsWithUrl = await Promise.all(imagesAttachments.map(async (image) => {
                return {
                    ...image,
                    url: image.url ? await getPresignedUrl(image.url) : null
                }
            }))

            return res.status(200).json({
                data: imagesAttachmentsWithUrl
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}