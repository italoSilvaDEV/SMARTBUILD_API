import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetFilesController {
    async handle(req: Request, res: Response) {
        const {
            companyId,
            userId
        } = req.params

        if (!companyId || !userId) {
            return res.status(400).json({
                error: "companyId and userId are required"
            })
        }

        try {
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

            const files = await prisma.projectFiles.findMany({
                where: {
                    companyId: companyId,
                    userAuthorId: userId
                }
            })

            return res.status(200).json({
                success: true,
                message: "Files fetched successfully",
                data: files
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}