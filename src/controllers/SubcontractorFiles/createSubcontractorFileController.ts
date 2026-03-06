import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";

export class CreateSubcontractorFileController {
    async handle(req: Request, res: Response) {
        const {
            name,
            description,
            pasteId,
            userId,
            subcontractorId,
            companyId
        } = req.body

        const filename = req.file

        if (!userId || !subcontractorId || !companyId) {
            return res.status(400).json({
                error: "userId, subcontractorId and companyId are required"
            })
        }

        if (pasteId) {
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
            let fileToS3 = null

            if (filename) {
                fileToS3 = await uploadFileToS3(filename, userId)
            }

            const newFile = await prisma.subcontractorFiles.create({
                data: {
                    file: fileToS3,
                    name: name,
                    description: description,
                    pasteId: pasteId || null,
                    type_file: filename ? "others" : "text",
                    userAuthorId: userId,
                    subcontractorId: subcontractorId,
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
