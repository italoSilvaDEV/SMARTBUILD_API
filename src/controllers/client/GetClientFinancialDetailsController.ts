import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class GetClientFinancialDetailsController {
    async handle(req: Request, res: Response) {
        try {
            const { email } = req.params;
            const { company_id } = req.query;

            if (!company_id) {
                return res.status(400).json({ error: "Company ID is required" });
            }

            // Get all clients with this email
            const clients = await prisma.client.findMany({
                where: {
                    email,
                    OR: [
                        { company_id: String(company_id) },
                        {
                            projects: {
                                some: {
                                    company_id: String(company_id),
                                    status_project: {
                                        notIn: ["Pending", "Accepted"]
                                    }
                                }
                            }
                        }
                    ]
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    location: true,
                    projects: {
                        where: {
                            company_id: String(company_id),
                            status_project: {
                                notIn: ["Pending", "Accepted"]
                            }
                        },
                        select: {
                            id: true,
                            contract_number: true,
                            status_project: true,
                            start_date: true,
                            date_creation: true,
                            location: true,
                            serviceProject: {
                                select: {
                                    id: true,
                                    name: true,
                                    description: true,
                                    hours: true,
                                    price: true,
                                    stages: true,
                                }
                            },
                        },
                        orderBy: {
                            date_creation: 'desc'
                        }
                    }
                }
            });

            if (!clients.length) {
                return res.status(404).json({ error: "No clients found with this email" });
            }

            // Combine all projects from all clients with the same email
            const allProjects = clients.flatMap(client => client.projects);

            // Calculate total revenue from all projects
            const totalRevenue = allProjects.reduce((sum, project) => {
                return sum + Number(project.serviceProject.reduce((total, service) => {
                    return total + Number(service.hours) * Number(service.price);
                }, 0));
            }, 0);

            // Format projects list
            const projectsList = allProjects.map(project => ({
                id: project.id,
                contract_number: project.contract_number,
                title: project.serviceProject?.[0]?.name || 'Untitled Project',
                start_date: project.start_date,
                status: project.status_project,
                location: project.location,
                value: Number(project.serviceProject.reduce((total, service) => {
                    return total + Number(service.hours) * Number(service.price);
                }, 0)),
                created_at: project.date_creation
            }));

            // Use the most recent client data for the response
            const primaryClient = clients[0];

            return res.json({
                client: {
                    id: primaryClient.id,
                    name: primaryClient.name,
                    email: primaryClient.email,
                    total_records: clients.length,
                    location: primaryClient.location
                },
                financial_summary: {
                    total_revenue: totalRevenue,
                    total_projects: allProjects.length
                },
                projects: projectsList
            });

        } catch (error) {
            // console.error("Error getting client financial details:", error);
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
} 