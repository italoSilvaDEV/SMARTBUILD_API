import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { userHasAccessToCompany } from "./fileAccess";

export class GetFilesController {
    async handle(req: Request, res: Response) {
        const {
            projectId
        } = req.params
        const authenticatedUserId = (req as any).userId as string | undefined;

        if (!projectId) {
            return res.status(400).json({
                error: "projectId is required"
            })
        }

        try {
            if (!authenticatedUserId) {
                return res.status(401).json({
                    error: "Authenticated user not found"
                })
            }

            const projectExists = await prisma.project.findUnique({
                where: {
                    id: projectId
                },
                select: {
                    id: true,
                    company_id: true
                }
            })

            if (!projectExists) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            const hasAccess = await userHasAccessToCompany(authenticatedUserId, projectExists.company_id);
            if (!hasAccess) {
                return res.status(403).json({
                    error: "Access denied"
                });
            }

            const files = await prisma.projectFiles.findMany({
                where: {
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
