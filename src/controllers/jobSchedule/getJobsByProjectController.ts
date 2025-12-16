import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetJobsByProjectController {
    async handle(req: Request, res: Response) {
        const { projectId } = req.params

        try {
            if (!projectId) {
                return res.status(400).json({
                    error: "Project ID is required"
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

            const jobs = await prisma.serviceProject.findMany({
                where: {
                    projectId: projectId,
                    start_date: {
                        not: null
                    },
                    deadline: {
                        not: null
                    }
                },
                select: {
                    id: true,
                    name: true,
                    start_date: true,
                    deadline: true,
                    UserServiceProject: {
                        select: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    avatar: true,
                                    hourly_price: true,
                                    isOverTime: true,
                                    profession: true,
                                }
                            }
                        }
                    },
                    Project: {
                        select: {
                            id: true,
                            workContext: {
                                select: {
                                    Name: true,
                                }
                            },
                            client: {
                                select: {
                                    name: true,
                                }
                            }
                        }
                    }
                }
            })

            const jobsFormatted = await Promise.all(jobs.map(async (job) => {
                const users = await Promise.all(job.UserServiceProject.map(async (user) => {
                    const avatar = user.user.avatar ? await getPresignedUrl(user.user.avatar) : null

                    return {
                        id: user.user.id,
                        name: user.user.name,
                        avatar: avatar,
                        hourly_price: user.user.hourly_price,
                        isOverTime: user.user.isOverTime,
                    }
                }))

                return {
                    id: job.id,
                    name: job.name,
                    start_date: job.start_date,
                    deadline: job.deadline,
                    clientName: job.Project?.workContext?.Name || job.Project?.client?.name,
                    projectId: job.Project?.id,
                    users: users,
                }
            }))

            return res.status(200).json({
                message: "Jobs fetched successfully",
                data: jobsFormatted
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}