import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetFileController {
    async handle(req: Request, res: Response) {
        const {
            id,
            userId,
            companyId
        } = req.params

        if (!id || !userId || !companyId) {
            return res.status(400).json({
                error: "id, userId and companyId are required"
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

        const companyExists = await prisma.company.findUnique({
            where: {
                id: companyId
            }
        })

        if (!companyExists) {
            return res.status(404).json({
                error: "Company not found"
            })
        }

        try {
            const file = await prisma.projectFiles.findUnique({
                where: {
                    id: id,
                    companyId: companyId,
                    userAuthorId: userId
                },
            })

            if (!file) {
                return res.status(404).json({
                    error: "File not found"
                })
            }

            const fileUrl = await getPresignedUrl(file.file)

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