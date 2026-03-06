import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";

export class DeleteSubcontractorFileController {
    async handle(req: Request, res: Response) {
        const {
            id
        } = req.params

        if (!id) {
            return res.status(400).json({
                error: "Id is required"
            })
        }

        const file = await prisma.subcontractorFiles.findUnique({
            where: {
                id
            }
        })

        if (!file) {
            return res.status(404).json({
                error: "File not found"
            })
        }

        try {
            if (file.file) {
                await deleteFileFromS3(file.file)
            }

            await prisma.subcontractorFiles.delete({
                where: {
                    id
                }
            })

            return res.status(200).json({
                success: true,
                message: "File deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
