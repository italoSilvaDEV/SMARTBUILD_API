import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { getPresignedUrl } from "../../../utils/S3/getPresignedUrl";

export class GetCustomJobsController {
    async handle(req: Request, res: Response) {
        const { projectId, companyId } = req.params

        try {
            if (!projectId || !companyId) {
                return res.status(400).json({
                    error: "Project ID and company ID are required"
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
                    id: projectId,
                    company_id: company.id
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

            const customJobs = await prisma.customServiceSchedule.findMany({
                where: {
                    projectId: project.id
                },
                select: {
                    id: true,
                    name: true,
                    start_date: true,
                    deadline: true,
                    description: true,
                    scheduleCompleted: true,
                    userServiceProjects: {
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
                    subServicesProjects: {
                        select: {
                            id: true,
                            name: true,
                            start_date: true,
                            deadline: true,
                            description: true,
                            scheduleCompleted: true,
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
                            userServiceProject: {
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
                            }
                        }
                    }
                }
            })

            const customJobsFormatted = await Promise.all(customJobs.map(async (customJob) => {
                const users = await Promise.all(customJob.userServiceProjects.map(async (user) => {
                    const avatar = user.user.avatar ? await getPresignedUrl(user.user.avatar) : null

                    return {
                        id: user.user.id,
                        name: user.user.name,
                        avatar: avatar,
                        email: user.user.email,
                        hourly_price: user.user.hourly_price,
                        isOverTime: user.user.isOverTime,
                        profession: user.user.profession,
                    }
                }))

                const subServices = await Promise.all(customJob.subServicesProjects.map(async (subService) => {
                    const users = await Promise.all(subService.userServiceProject.map(async (user) => {
                        const avatar = user.user.avatar ? await getPresignedUrl(user.user.avatar) : null

                        return {
                            id: user.user.id,
                            name: user.user.name,
                            avatar: avatar,
                            email: user.user.email,
                            hourly_price: user.user.hourly_price,
                            isOverTime: user.user.isOverTime,
                            profession: user.user.profession,
                        }
                    }))

                    return {
                        id: subService.id,
                        name: subService.name,
                        description: subService.description,
                        start_date: subService.start_date,
                        deadline: subService.deadline,
                        scheduleCompleted: subService.scheduleCompleted,
                        users: users,
                        subContractors: subService.subContractorServiceProjects,
                    }
                }))

                return {
                    id: customJob.id,
                    name: customJob.name,
                    start_date: customJob.start_date,
                    deadline: customJob.deadline,
                    description: customJob.description,
                    scheduleCompleted: customJob.scheduleCompleted,
                    users: users,
                    subContractors: customJob.subContractorServiceProjects,
                    subServices: subServices,
                }
            }))

            return res.status(200).json({
                message: "Custom jobs fetched successfully",
                data: customJobsFormatted
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}