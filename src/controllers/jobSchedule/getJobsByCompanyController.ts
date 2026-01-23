import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetJobsByCompanyController {
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

            const allProjects = await prisma.project.findMany({
                where: {
                    company_id: company.id,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                    }
                },
                select: {
                    id: true,
                    location: true,
                    contract_number: true,
                    log: true,
                    lat: true,
                    workContext: {
                        select: {
                            Name: true,
                            Email: true,
                            location: true,
                            latitude: true,
                            longitude: true
                        }
                    },
                    client: {
                        select: {
                            name: true,
                            email: true,
                            location: true,
                            lat: true,
                            log: true
                        }
                    },
                    start_date: true,
                    deadline: true,
                }
            })

            const projectsWithSchedule = allProjects.filter(project =>
                project.start_date &&
                project.deadline &&
                project.start_date !== "" &&
                project.deadline !== ""
            )

            const jobs = await Promise.all(projectsWithSchedule.map(async (project) => {
                return {
                    id: project.id,
                    name: project.workContext?.Name || project.client?.name,
                    start_date: project.start_date,
                    deadline: project.deadline,
                    clientName: project.workContext?.Name || project.client?.name,
                    clientEmail: project.workContext?.Email || project.client?.email,
                    projectLocation: project.workContext?.location || project.client?.location || project.location,
                    projectLongitude: project.workContext?.longitude || project.client?.log || project.log,
                    projectLatitude: project.workContext?.latitude || project.client?.lat || project.lat,
                    contract_number: project.contract_number,
                }
            }))

            return res.status(200).json({
                message: "Jobs fetched successfully",
                data: jobs
            })
        } catch (error) {
            return res.status(500).json({
                error: "Internal server error"
            })
        }
    }
}