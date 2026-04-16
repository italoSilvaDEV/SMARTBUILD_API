import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { userHasAccessToCompany } from "./fileAccess";

export class DeleteFileController {
    async handle(req: Request, res: Response) {
        const {
            id
        } = req.params
        const authenticatedUserId = (req as any).userId as string | undefined;

        if (!id) {
            return res.status(400).json({
                error: "Id is required"
            })
        }

        try {
            if (!authenticatedUserId) {
                return res.status(401).json({
                    error: "Authenticated user not found"
                })
            }

            const file = await prisma.projectFiles.findUnique({
                where: {
                    id
                }
            })

            if (!file) {
                return res.status(404).json({
                    error: "File not found"
                })
            }

            const project = await prisma.project.findUnique({
                where: {
                    id: file.projectId
                },
                select: {
                    company_id: true
                }
            });

            const hasAccess = await userHasAccessToCompany(
                authenticatedUserId,
                project?.company_id || file.companyId
            );

            if (!hasAccess) {
                return res.status(403).json({
                    error: "Access denied"
                });
            }

            if (file.file) {
                await deleteFileFromS3(file.file)
            }

            await prisma.projectFiles.delete({
                where: {
                    id
                }
            })

            return res.status(200).json({
                success: true,
                message: "File deleted successfully"
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}
