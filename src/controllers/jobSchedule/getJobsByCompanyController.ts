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

            const projects = await prisma.project.findMany({
                where: {
                    company_id: company.id,
                    status_project: {
                        in: ["Pre-Start", "In Progress", "Final walkthrough", "Finished"]
                    },
                    start_date: {
                        not: null
                    },
                    deadline: {
                        not: null
                    }
                },
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
                    },
                    start_date: true,
                    deadline: true,
                }
            })

            const jobs = Promise.all(projects.map(async (project) => {
                return {
                    id: project.id,
                    name: project.workContext?.Name || project.client?.name,
                    start_date: project.start_date,
                    deadline: project.deadline,
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