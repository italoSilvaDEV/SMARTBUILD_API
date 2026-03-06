import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetSubcontractorFileController {
    async handle(req: Request, res: Response) {
        const {
            id,
            userId,
            subcontractorId
        } = req.params

        if (!id || !userId || !subcontractorId) {
            return res.status(400).json({
                error: "id, userId and subcontractorId are required"
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

        try {
            const file = await prisma.subcontractorFiles.findFirst({
                where: {
                    id: id,
                    subcontractorId: subcontractorId,
                    userAuthorId: userId
                },
            })

            if (!file) {
                return res.status(404).json({
                    error: "File not found"
                })
            }

            const fileUrl = file.file ? await getPresignedUrl(file.file) : null

            return res.status(200).json({
                success: true,
                message: "File fetched successfully",
                data: {
                    ...file,
                    file: fileUrl
                }
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
