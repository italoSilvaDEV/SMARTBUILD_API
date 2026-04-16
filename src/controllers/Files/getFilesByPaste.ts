import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { userHasAccessToCompany } from "./fileAccess";

export class GetFilesController {
    async handle(req: Request, res: Response) {
        const {
            pasteId,
            projectId
        } = req.params
        const authenticatedUserId = (req as any).userId as string | undefined;

        if (!pasteId || !projectId) {
            return res.status(400).json({
                error: "pasteId and projectId are required"
            })
        }

        try {
            if (!authenticatedUserId) {
                return res.status(401).json({
                    error: "Authenticated user not found"
                })
            }

            const paste = await prisma.projectPastes.findUnique({
                where: {
                    id: pasteId
                },
                select: {
                    id: true,
                    projectId: true,
                    companyId: true
                }
            })

            if (!paste) {
                return res.status(404).json({
                    error: "Paste not found"
                })
            }

            const project = await prisma.project.findUnique({
                where: {
                    id: projectId
                },
                select: {
                    id: true,
                    company_id: true
                }
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            if (paste.projectId !== project.id) {
                return res.status(400).json({
                    error: "Paste does not belong to this project"
                });
            }

            const hasAccess = await userHasAccessToCompany(
                authenticatedUserId,
                project.company_id || paste.companyId
            );

            if (!hasAccess) {
                return res.status(403).json({
                    error: "Access denied"
                });
            }

            const files = await prisma.projectFiles.findMany({
                where: {
                    pasteId: pasteId,
                    projectId: projectId
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
