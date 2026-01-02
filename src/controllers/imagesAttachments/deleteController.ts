import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";

export class DeleteImagesAttachmentsController {
    async handle(req: Request, res: Response) {
        const {
            imageId
        } = req.params

        try {
            const image = await prisma.imagesAttachments.findUnique({
                where: {
                    id: imageId
                }
            })

            if (!image) {
                return res.status(404).json({
                    error: "Image not found"
                })
            }

            if (image.url) {
                await deleteFileFromS3(image.url)
            }

            await prisma.imagesAttachments.delete({
                where: {
                    id: imageId
                }
            })

            return res.status(200).json({
                success: true,
                message: "Image deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}