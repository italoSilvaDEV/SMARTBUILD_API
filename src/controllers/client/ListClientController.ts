import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { Prisma } from "@prisma/client";

export class ListClientController {
    // ANTIGO
    async handle(req: Request, res: Response) {
        try {
            const { company_id, search = "" } = req.query;

            if (!company_id) {
                return res.status(400).json({ error: "Company ID is required" });
            }

            // Get current month date range
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            // Modified query to return all unique clients without pagination
            const clientsQuery = await prisma.$queryRaw<any[]>`
                WITH RankedClients AS (
                    SELECT 
                        c.id,
                        c.name,
                        c.email,
                        c.phone,
                        c.date_creation,
                        ROW_NUMBER() OVER (PARTITION BY LOWER(c.email) ORDER BY c.date_creation DESC) as rn
                    FROM Client c
                    LEFT JOIN project p ON p.client_id = c.id
                    WHERE 
                        (c.company_id = ${String(company_id)} OR p.company_id = ${String(company_id)})
                        ${search ? Prisma.sql`AND (
                            LOWER(c.name) LIKE LOWER(${`%${search}%`}) OR 
                            LOWER(c.email) LIKE LOWER(${`%${search}%`}) OR 
                            LOWER(c.location) LIKE LOWER(${`%${search}%`})
                        )` : Prisma.empty}
                )
                SELECT 
                    id,
                    name,
                    email,
                    phone,
                    date_creation
                FROM RankedClients
                WHERE rn = 1
                ORDER BY date_creation DESC, name ASC
            `;

            // Get total count of unique emails
            const totalCountQuery = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(DISTINCT LOWER(c.email)) as count
                FROM Client c
                LEFT JOIN project p ON p.client_id = c.id
                WHERE 
                    (c.company_id = ${String(company_id)} OR p.company_id = ${String(company_id)})
                    ${search ? Prisma.sql`AND (
                        LOWER(c.name) LIKE LOWER(${`%${search}%`}) OR 
                        LOWER(c.email) LIKE LOWER(${`%${search}%`}) OR 
                        LOWER(c.location) LIKE LOWER(${`%${search}%`})
                    )` : Prisma.empty}
            `;

            const totalCount = Number(totalCountQuery[0].count);

            // Get new clients registered in current month (first time registrations only)
            const newClientsThisMonth = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(DISTINCT LOWER(c1.email)) as count
                FROM Client c1
                LEFT JOIN project p ON p.client_id = c1.id
                WHERE 
                    (c1.company_id = ${String(company_id)} OR p.company_id = ${String(company_id)})
                    AND c1.date_creation >= ${startOfMonth}
                    AND c1.date_creation <= ${endOfMonth}
                    AND NOT EXISTS (
                        SELECT 1 FROM Client c2
                        LEFT JOIN project p2 ON p2.client_id = c2.id
                        WHERE LOWER(c2.email) = LOWER(c1.email)
                        AND (c2.company_id = ${String(company_id)} OR p2.company_id = ${String(company_id)})
                        AND c2.date_creation < ${startOfMonth}
                    )
            `;

            const currentMonthCount = Number(newClientsThisMonth[0].count);

            // Format the clients
            const formattedClients = clientsQuery.map(({ id, name, email, phone }) => ({
                id,
                name,
                email,
                phone,
            }));

            // Get total raw count for duplicates check
            const rawCount = await prisma.client.count({
                where: {
                    OR: [
                        { company_id: String(company_id) },
                        {
                            projects: {
                                some: {
                                    company_id: String(company_id)
                                }
                            }
                        }
                    ]
                }
            });

            return res.json({
                total: totalCount,
                totalCurrentMonth: currentMonthCount,
                clients: formattedClients,
                duplicatesFound: totalCount !== rawCount
            });

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
    // ATUAL
    async handleNewClients(req: Request, res: Response) {
        try {
            const { company_id, search = "" } = req.query;

            if (!company_id) {
                return res.status(400).json({ error: "Company ID is required" });
            }

            // Datas do mês atual
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
                23,
                59,
                59
            );

            // Filtro de busca com tipagem explícita
            const searchFilter: Prisma.ClientWhereInput = search
                ? {
                    OR: [
                        {
                            name: {
                                contains: String(search),
                            },
                        },
                        {
                            email: {
                                contains: String(search),
                            },
                        },
                        {
                            location: {
                                contains: String(search),
                            },
                        },
                    ],
                }
                : {};

            // Buscar clientes com projetos, serviços e invoices
            const clientsQuery = await prisma.client.findMany({
                where: {
                    company_id: String(company_id),
                    ...searchFilter,
                },
                orderBy: [{ name: "asc" }],
                include: {
                    _count: {
                        select: { 
                            projects: true
                        },
                    },
                    projects: {
                        select: {
                            price: true,
                            serviceProject: {
                                select: {
                                    hours: true,
                                    price: true,
                                }
                            },
                            invoices: {
                                select: {
                                    totalAmount: true,
                                    status: true,
                                    dueDate: true,
                                }
                            }
                        }
                    }
                },
            });

            // Contagem total
            const totalCount = await prisma.client.count({
                where: {
                    company_id: String(company_id),
                    ...searchFilter,
                },
            });

            // Contagem de novos clientes neste mês
            const newClientsThisMonth = await prisma.client.count({
                where: {
                    company_id: String(company_id),
                    date_creation: {
                        gte: startOfMonth,
                        lte: endOfMonth,
                    },
                },
            });

            // Formatar resposta com dados de projetos e invoices
            const formattedClients = clientsQuery.map((client) => {
                const {
                    id, name, email, phone, _count, location, addressOffice,
                    lat, log, birth_date, document, radius, projects
                } = client;

                // Calcular totalRevenue com base nos serviços dos projetos
                const currentDate = new Date();
                let totalRevenue = 0;
                let totalPaid = 0;
                let totalNotDueYet = 0;
                let totalOverdue = 0;

                // Total Revenue = soma dos valores dos projetos (serviços ou price)
                projects.forEach(project => {
                    // Se tiver serviços, calcular pela soma. Caso contrário, usar project.price
                    const projectValue = project.serviceProject.length > 0
                        ? project.serviceProject.reduce((sum, service) => {
                            return sum + (Number(service.hours || 0) * Number(service.price || 0));
                          }, 0)
                        : Number(project.price || 0);
                    totalRevenue += projectValue;

                    // Calcular estatísticas de invoices para cada projeto
                    project.invoices.forEach(invoice => {
                        const amount = Number(invoice.totalAmount || 0);
                        
                        if (invoice.status === 'paid') {
                            totalPaid += amount;
                        } else if (invoice.dueDate && new Date(invoice.dueDate) < currentDate) {
                            totalOverdue += amount;
                        } else {
                            totalNotDueYet += amount;
                        }
                    });
                });

                return {
                    id,
                    name,
                    email,
                    phone,
                    birth_date,
                    document,
                    location,
                    addressOffice,
                    lat,
                    log,
                    projects: _count.projects,
                    radius,
                    totalRevenue: Number(totalRevenue.toFixed(2)),
                    totalPaid: Number(totalPaid.toFixed(2)),
                    totalNotDueYet: Number(totalNotDueYet.toFixed(2)),
                    totalOverdue: Number(totalOverdue.toFixed(2)),
                };
            });

            return res.json({
                total: totalCount,
                totalCurrentMonth: newClientsThisMonth,
                clients: formattedClients,
                duplicatesFound: false,
            });
        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    // Buscar clientes com work contexts
    async handleClientsWithWorkContexts(req: Request, res: Response) {
        try {
            const { company_id, search = "" } = req.query;

            if (!company_id) {
                return res.status(400).json({ error: "Company ID is required" });
            }

            // Filtro de busca
            const searchFilter: Prisma.ClientWhereInput = search
                ? {
                    OR: [
                        { name: { contains: String(search) } },
                        { email: { contains: String(search) } },
                        { location: { contains: String(search) } },
                    ],
                }
                : {};

            // Buscar clientes com work contexts
            const clientsQuery = await prisma.client.findMany({
                where: {
                    company_id: String(company_id),
                    ...searchFilter,
                },
                orderBy: [{ name: "asc" }],
                include: {
                    workContexts: {
                        where: {
                            isActive: true,
                        },
                        orderBy: { createdAt: "desc" },
                        include: {
                            _count: {
                                select: { projects: true },
                            },
                        },
                    },
                },
            });

            // Formatar resposta
            const formattedClients = clientsQuery.map((client) => ({
                id: client.id,
                name: client.name,
                email: client.email,
                phone: client.phone,
                addressOffice: client.addressOffice,
                workContexts: client.workContexts.map((wc) => ({
                    id: wc.id,
                    type: wc.type,
                    Name: wc.Name,
                    Email: wc.Email,
                    phone: wc.phone,
                    addressOffice: wc.addressOffice,
                    location: wc.location,
                    projectsCount: wc._count.projects,
                })),
            }));

            return res.json({
                clients: formattedClients,
                total: clientsQuery.length,
            });
        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
} 