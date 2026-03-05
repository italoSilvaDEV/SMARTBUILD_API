import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetSubcontractorFilesByPasteController {
    async handle(req: Request, res: Response) {
        const {
            pasteId,
            userId,
            subcontractorId
        } = req.params

        if (!pasteId || !userId || !subcontractorId) {
            return res.status(400).json({
                error: "pasteId, userId and subcontractorId are required"
            })
        }

        try {
            const paste = await prisma.subcontractorPastes.findUnique({
                where: {
                    id: pasteId
                }
            })

            if (!paste) {
                return res.status(404).json({
                    error: "Paste not found"
                })
            }

            const user = await prisma.user.findUnique({
                where: {
                    id: userId
                }
            })

            if (!user) {
                return res.status(404).json({
                    error: "User not found"
                })
            }

            const subcontractor = await prisma.subcontractor.findUnique({
                where: {
                    id: subcontractorId
                }
            })

            if (!subcontractor) {
                return res.status(404).json({
                    error: "Subcontractor not found"
                })
            }

            const files = await prisma.subcontractorFiles.findMany({
                where: {
                    pasteId: pasteId,
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
