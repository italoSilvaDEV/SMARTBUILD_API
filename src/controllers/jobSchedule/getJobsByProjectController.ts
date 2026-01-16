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
                    start_date: { not: null },
                    deadline: { not: null }
                },
                select: {
                    id: true,
                    name: true,
                    start_date: true,
                    deadline: true,
                    description: true,
                    scheduleCompleted: true,
                    UserServiceProject: {
                        select: {
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    avatar: true,
                                    email: true,
                                    hourly_price: true,
                                    isOverTime: true,
                                    profession: true,
                                }
                            }
                        }
                    },
                    subContractorServiceProjects: {
                        select: {
                            subcontractor: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                    address: true,
                                }
                            }
                        }
                    },
                    Project: {
                        select: {
                            id: true,
                            workContext: { select: { Name: true, Email: true } },
                            client: { select: { name: true, email: true } }
                        }
                    },
                    subServicesProjects: {
                        select: {
                            id: true,
                            name: true,
                            start_date: true,
                            description: true,
                            deadline: true,
                            scheduleCompleted: true,
                            userServiceProject: {
                                select: {
                                    user: {
                                        select: {
                                            id: true,
                                            avatar: true,
                                            name: true,
                                            email: true,
                                            hourly_price: true,
                                            isOverTime: true,
                                            profession: true,
                                        }
                                    }
                                }
                            },
                            subContractorServiceProjects: {
                                select: {
                                    subcontractor: {
                                        select: {
                                            id: true,
                                            name: true,
                                            email: true,
                                            phone: true,
                                            address: true,
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })

            const formatSubcontractors = (junctions: any[]) => junctions.map(j => j.subcontractor);

            const jobsFormatted = await Promise.all(jobs.map(async (job) => {
                const users = await Promise.all(job.UserServiceProject.map(async (user) => {
                    const avatar = user.user.avatar ? await getPresignedUrl(user.user.avatar) : null
                    return { ...user.user, avatar }
                }))

                const subServices = await Promise.all(job.subServicesProjects.map(async (ss) => {
                    const ssUsers = await Promise.all(ss.userServiceProject.map(async (u) => {
                        const avatar = u.user.avatar ? await getPresignedUrl(u.user.avatar) : null
                        return { ...u.user, avatar }
                    }))
                    return {
                        ...ss,
                        users: ssUsers,
                        subContractors: formatSubcontractors(ss.subContractorServiceProjects)
                    }
                }))

                return {
                    id: job.id,
                    name: job.name,
                    start_date: job.start_date,
                    description: job.description,
                    deadline: job.deadline,
                    clientName: job.Project?.workContext?.Name || job.Project?.client?.name,
                    clientEmail: job.Project?.workContext?.Email || job.Project?.client?.email,
                    projectId: job.Project?.id,
                    scheduleCompleted: job.scheduleCompleted,
                    type: 'service',
                    users,
                    subServicesProjects: subServices,
                    subContractors: formatSubcontractors(job.subContractorServiceProjects),
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