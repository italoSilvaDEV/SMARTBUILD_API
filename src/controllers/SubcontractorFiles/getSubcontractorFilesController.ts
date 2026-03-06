import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetSubcontractorFilesController {
    async handle(req: Request, res: Response) {
        const {
            subcontractorId,
            userId
        } = req.params

        if (!subcontractorId || !userId) {
            return res.status(400).json({
                error: "subcontractorId and userId are required"
            })
        }

        try {
            const subcontractorExists = await prisma.subcontractor.findUnique({
                where: {
                    id: subcontractorId
                }
            })

            if (!subcontractorExists) {
                return res.status(404).json({
                    error: "Subcontractor not found"
                })
            }

            const userExists = await prisma.user.findUnique({
                where: {
                    id: userId
                }
            })

            if (!userExists) {
                return res.status(404).json({
                    error: "User not found"
                })
            }

            const files = await prisma.subcontractorFiles.findMany({
                where: {
                    subcontractorId: subcontractorId,
                    userAuthorId: userId
                }
            })

            const filesWithUrl = await Promise.all(files.map(async (file) => {
                let fileUrl = null

                if (file.file) {
                    fileUrl = await getPresignedUrl(file.file)
                }

                return {
                    ...file,
                    file: fileUrl
                }
            }))

            return res.status(200).json({
                success: true,
                message: "Files fetched successfully",
                data: filesWithUrl
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
