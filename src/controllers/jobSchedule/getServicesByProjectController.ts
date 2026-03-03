import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetServicesByProjectController {
    async handle(req: Request, res: Response) {
        const {
            projectId,
            companyId
        } = req.params

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

            const services = await prisma.serviceProject.findMany({
                where: {
                    projectId: project.id
                },
                select: {
                    id: true,
                    name: true,
                    start_date: true,
                    description: true,
                    hours: true,
                    price: true,
                    deadline: true,
                    id_service: true,
                    service: {
                        select: {
                            service: {
                                select: {
                                    subcategory: {
                                        select: {
                                            id: true,
                                            category_name: true,
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })

            const mappedServices = services.map((s) => ({
                id: s.id,
                name: s.name,
                start_date: s.start_date,
                description: s.description,
                hours: s.hours,
                price: s.price,
                deadline: s.deadline,
                categoryId: s.service?.service?.subcategory?.id ?? null,
                categoryName: s.service?.service?.subcategory?.category_name ?? null,
            }))

            const customServices = await prisma.customServiceSchedule.findMany({
                where: {
                    projectId: project.id
                },
                select: {
                    id: true,
                    name: true,
                    start_date: true,
                    deadline: true,
                    description: true,
                }
            })

            return res.status(200).json({
                message: "Services fetched successfully",
                data: {
                    services: mappedServices,
                    customServices: customServices,
                }
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}