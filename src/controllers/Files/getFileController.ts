import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { userHasAccessToCompany } from "./fileAccess";

export class GetFileController {
    async handle(req: Request, res: Response) {
        const {
            id,
            projectId
        } = req.params
        const authenticatedUserId = (req as any).userId as string | undefined;

        if (!id || !projectId) {
            return res.status(400).json({
                error: "id and projectId are required"
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

            const file = await prisma.projectFiles.findFirst({
                where: {
                    id: id,
                    projectId: projectId
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
