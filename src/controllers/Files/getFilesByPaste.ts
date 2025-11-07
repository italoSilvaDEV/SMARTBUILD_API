import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetFilesController {
    async handle(req: Request, res: Response) {
        const {
            pasteId,
            userId,
            companyId
        } = req.params

        if (!pasteId || !userId || !companyId) {
            return res.status(400).json({
                error: "pasteId, userId and companyId are required"
            })
        }

        try {
            const paste = await prisma.projectPastes.findUnique({
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

            const company = await prisma.company.findUnique({
                where: {
                    id: companyId
                }
            })

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                })
            }

            const files = await prisma.projectFiles.findMany({
                where: {
                    pasteId: pasteId,
                    companyId: companyId,
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