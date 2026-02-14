import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SubcontractorProjectsController {
    /**
     * Busca todos os projetos vinculados a um subcontractor específico
     */
    async getSubcontractorProjects(req: Request, res: Response) {
        try {
            const { subcontractor_id, company_id, page = "0", search = "" } = req.query;

            if (!subcontractor_id || !company_id) {
                return res.status(400).json({
                    error: "subcontractor_id and company_id are required"
                });
            }

            const pageNumber = parseInt(page as string);
            const itemsPerPage = 20;
            const skip = pageNumber * itemsPerPage;

            // Busca registros de horas trabalhadas para identificar projetos
            const workedHoursRecords = await prisma.workedhours.findMany({
                where: {
                    subcontractor_id: subcontractor_id as string,
                    amount_of_hours: null, // Subcontractors não têm horas, apenas preço
                },
                select: {
                    project_id: true,
                },
                distinct: ['project_id'],
            });

            const projectIds = workedHoursRecords.map((record: any) => record.project_id);

            if (projectIds.length === 0) {
                return res.status(200).json({
                    projects: [],
                    total: 0,
                    totalPages: 0,
                    currentPage: pageNumber
                });
            }

            // Busca os projetos vinculados ao subcontractor
            const whereClause: any = {
                id: { in: projectIds },
                company_id: company_id as string,
            };

            // Busca por número do contrato, nome do cliente ou location (igual getAllProjects do ProjectController)
            if (search && String(search).trim() !== "") {
                const searchStr = String(search).trim();
                const orConditions: any[] = [
                    { client: { name: { contains: searchStr } } },
                    { location: { contains: searchStr } },
                ];
                const num = Number(searchStr);
                if (!Number.isNaN(num)) {
                    orConditions.unshift({ contract_number: { equals: num } });
                }
                whereClause.OR = orConditions;
            }

            const [projects, total] = await Promise.all([
                prisma.project.findMany({
                    where: whereClause,
                    skip,
                    take: itemsPerPage,
                    include: {
                        client: {
                            select: {
                                name: true,
                                location: true,
                            }
                        },
                        user: {
                            select: {
                                name: true,
                            }
                        },
                        project_manager: {
                            select: {
                                name: true,
                            }
                        },
                        serviceProject: {
                            select: {
                                hours: true,
                                price: true,
                            }
                        }
                    },
                    orderBy: {
                        date_creation: 'desc'
                    }
                }),
                prisma.project.count({
                    where: whereClause
                })
            ]);

            // Para cada projeto: valor total do projeto, custo do subcontractor e costEntries (workedhours)
            const projectsWithCostEntries = await Promise.all(
                projects.map(async (project) => {
                    const costEntries = await prisma.workedhours.findMany({
                        where: {
                            project_id: project.id,
                            subcontractor_id: subcontractor_id as string,
                            amount_of_hours: null,
                        },
                        include: {
                            subcontractor: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    phone: true,
                                }
                            }
                        },
                        orderBy: { date_creation: 'desc' }
                    });

                    const totalSubcontractorCost = costEntries.reduce((acc: number, record: any) => {
                        return acc + parseFloat(record.hourly_price?.toString() || '0');
                    }, 0);

                    const projectValue = project.serviceProject.reduce((acc: number, service: any) => {
                        return acc + (Number(service.hours) * Number(service.price));
                    }, 0);

                    return {
                        ...project,
                        price: projectValue,
                        subcontractorCost: totalSubcontractorCost,
                        costEntries: costEntries.map((wh: any) => ({
                            id: wh.id,
                            start_date: wh.start_date,
                            end_date: wh.end_date,
                            description: wh.description,
                            payment_date: wh.payment_date,
                            hourly_price: wh.hourly_price?.toString() ?? '0',
                            date_creation: wh.date_creation,
                            name_user: wh.name_user,
                            subcontractor: wh.subcontractor,
                        })),
                    };
                })
            );

            const totalPages = Math.ceil(total / itemsPerPage);

            return res.status(200).json({
                projects: projectsWithCostEntries,
                total,
                totalPages,
                currentPage: pageNumber
            });

        } catch (error) {
            console.error("Error fetching subcontractor projects:", error);
            return res.status(500).json({
                error: "Internal server error while fetching subcontractor projects"
            });
        }
    }

    /**
     * Busca detalhes do subcontractor com estatísticas
     */
    async getSubcontractorDetails(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { company_id } = req.query;

            if (!id || !company_id) {
                return res.status(400).json({
                    error: "id and company_id are required"
                });
            }

            // Busca o subcontractor
            const subcontractor = await prisma.subcontractor.findFirst({
                where: {
                    id,
                    company_id: company_id as string
                }
            });

            if (!subcontractor) {
                return res.status(404).json({
                    error: "Subcontractor not found"
                });
            }

            // Busca registros de horas trabalhadas para calcular estatísticas
            const workedHoursRecords = await prisma.workedhours.findMany({
                where: {
                    subcontractor_id: id,
                    amount_of_hours: null,
                },
                select: {
                    project_id: true,
                    hourly_price: true,
                },
            });

            // Calcula o número de projetos únicos
            const uniqueProjectIds = [...new Set(workedHoursRecords.map((record: any) => record.project_id))];
            const totalProjects = uniqueProjectIds.length;

            // Calcula o valor total pago
            const totalPaid = workedHoursRecords.reduce((acc: number, record: any) => {
                return acc + parseFloat(record.hourly_price?.toString() || '0');
            }, 0);

            return res.status(200).json({
                subcontractor: {
                    ...subcontractor,
                    statistics: {
                        totalProjects,
                        totalPaid,
                    }
                }
            });

        } catch (error) {
            console.error("Error fetching subcontractor details:", error);
            return res.status(500).json({
                error: "Internal server error while fetching subcontractor details"
            });
        }
    }
}
