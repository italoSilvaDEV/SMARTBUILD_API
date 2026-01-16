import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetUsersByProjectController {
    async handle(req: Request, res: Response) {
        const { projectId, companyId } = req.params

        try {
            if (!projectId || !companyId) {
                return res.status(400).json({
                    error: "Company ID is required"
                })
            }

            const company = await prisma.company.findUnique({
                where: {
                    id: companyId
                },
                select: {
                    id: true,
                }
            })

            if (!company) {
                return res.status(404).json({
                    error: "Company not found"
                })
            }

            const project = await prisma.project.findUnique({
                where: {
                    id: projectId
                },
                select: {
                    id: true,
                }
            })

            if (!project) {
                return res.status(404).json({
                    error: "Project not found"
                })
            }

            const users = await prisma.user.findMany({
                where: {
                    companies: {
                        some: {
                            companyId: company.id
                        }
                    },
                },
                select: {
                    id: true,
                    name: true,
                    avatar: true,
                    hourly_price: true,
                    isOverTime: true,
                    profession: true,
                }
            })

            console.log(users.length)

            const usersFormatted = await Promise.all(users.map(async (user) => {
                const avatarUrl = user.avatar ? await getPresignedUrl(user.avatar) : null

                return {
                    id: user.id,
                    name: user.name,
                    avatar: avatarUrl,
                    hourly_price: user.hourly_price,
                    isOverTime: user.isOverTime,
                    profession: user.profession,
                }
            }))

            return res.status(200).json({
                message: "Users fetched successfully",
                data: usersFormatted
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}