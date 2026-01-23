import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class GetProjectsByCompanyController {
    async handle(req: Request, res: Response) {
        const { companyId } = req.params

        try {
            if (!companyId) {
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

            const projects = await prisma.project.findMany({
                where: {
                    company_id: company.id,
                    status_project: {
                        in: ["In Progress", "Pre-Start"]
                    }
                },
                select: {
                    id: true,
                    contract_number: true,
                    workContext: {
                        select: {
                            Name: true,
                            location: true,
                            Email: true,
                            latitude: true,
                            longitude: true
                        }
                    },
                    client: {
                        select: {
                            name: true,
                            location: true,
                            email: true,
                            lat: true,
                            log: true
                        }
                    },
                    cover_photo: true,
                    status_project: true,
                    serviceProject: {
                        select: {
                            id: true,
                            name: true,
                            status: true,
                            hours: true,
                            price: true,
                        }
                    }
                },
                orderBy: {
                    status_project: "desc"
                }
            })

            const projectsFormatted = await Promise.all(projects.map(async (project) => {
                const coverPhotoUrl = project.cover_photo ? await getPresignedUrl(project.cover_photo) : null
                const totalPrice = project.serviceProject?.reduce((total, service) => total + Number(service.price) * Number(service.hours), 0)

                const servicesFormatted = project.serviceProject?.map((service) => {
                    return {
                        id: service.id,
                        name: service.name,
                        status: service.status,
                        hours: service.hours,
                        price: service.price
                    }
                })

                return {
                    id: project.id,
                    contract_number: project.contract_number,
                    clientName: project.workContext?.Name || project.client?.name,
                    clientLocation: project.workContext?.location || project.client?.location,
                    clientLongitude: project.workContext?.longitude ? project.workContext?.longitude : project.client?.log,
                    clientLatitude: project.workContext?.latitude ? project.workContext?.latitude : project.client?.lat,
                    clientEmail: project.workContext?.Email ? project.workContext?.Email : project.client?.email,
                    coverPhotoUrl: coverPhotoUrl,
                    status: project.status_project,
                    price: totalPrice,
                    services: servicesFormatted
                }
            }))

            return res.status(200).json({
                message: "Projects fetched successfully",
                data: projectsFormatted
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}