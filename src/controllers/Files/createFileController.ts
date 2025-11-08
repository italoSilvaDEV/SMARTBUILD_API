import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";

export class CreateFileController {
    async handle(req: Request, res: Response) {
        const {
            name,
            description,
            pasteId,
            userId,
            projectId,
            companyId
        } = req.body

        const filename = req.file

        if (!filename) {
            return res.status(400).json({
                error: "File is required"
            })
        }

        if (!userId || !projectId || !companyId) {
            return res.status(400).json({
                error: "userId, projectId and companyId are required"
            })
        }

        if (pasteId) {
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

        const project = await prisma.project.findUnique({
            where: {
                id: projectId
            }
        })

        if (!project) {
            return res.status(404).json({
                error: "Project not found"
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

        try {
            const fileToS3 = await uploadFileToS3(filename, userId)

            const newFile = await prisma.projectFiles.create({
                data: {
                    file: fileToS3,
                    name: name,
                    description: description,
                    pasteId: pasteId,
                    userAuthorId: userId,
                    projectId: projectId,
                    companyId: companyId
                }
            })

            return res.status(201).json({
                success: true,
                message: "File created successfully",
                data: newFile
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}