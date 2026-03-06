import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";

export class UpdateSubcontractorFileController {
    async handle(req: Request, res: Response) {
        const {
            id,
            name,
            description,
        } = req.body

        const filename = req.file

        if (!id) {
            return res.status(400).json({
                error: "Id is required"
            })
        }

        try {
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

            if (!filename && !name && !description) {
                return res.status(400).json({
                    error: "At least one field is required"
                })
            }

            let data: {
                file?: string
                name?: string
                description?: string
            } = {}

            if (filename) {
                if (file.file) {
                    await deleteFileFromS3(file.file)
                }

                const fileToS3 = await uploadFileToS3(filename, file.userAuthorId)

                data.file = fileToS3
            }

            if (name && name.trim().length > 0 && file.name !== name) {
                data.name = name
            }

            if (description !== undefined && description !== null && file.description !== description) {
                data.description = description
            }

            const updatedFile = await prisma.subcontractorFiles.update({
                where: {
                    id
                },
                data
            })

            return res.status(200).json({
                success: true,
                message: "File updated successfully",
                data: updatedFile
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
