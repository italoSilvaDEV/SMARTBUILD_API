import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { Prisma } from "@prisma/client";

export class ListClientController {
    async handle(req: Request, res: Response) {
        try {
            const { company_id, page = 1, itemsPerPage = 10, search = "" } = req.query;
            
            if (!company_id) {
                return res.status(400).json({ error: "Company ID is required" });
            }

            const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
            const itemsLimit = Number(itemsPerPage);

            // Get current month date range
            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            // Base where condition
            const whereCondition = {
                AND: [
                    {
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
                    },
                    {
                        OR: search ? [
                            { name: { contains: String(search) } },
                            { email: { contains: String(search) } },
                            { location: { contains: String(search) } }
                        ] : undefined
                    }
                ]
            };

            // Get total count of distinct clients
            const totalCountQuery = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(DISTINCT c.email) as count
                FROM Client c
                LEFT JOIN project p ON p.client_id = c.id
                WHERE 
                    (c.company_id = ${String(company_id)} OR p.company_id = ${String(company_id)})
                    ${search ? Prisma.sql`AND (
                        c.name LIKE ${`%${search}%`} OR 
                        c.email LIKE ${`%${search}%`} OR 
                        c.location LIKE ${`%${search}%`}
                    )` : Prisma.empty}
            `;

            const totalCount = Number(totalCountQuery[0].count);

            // Get new clients registered in current month (first time registrations only)
            const newClientsThisMonth = await prisma.$queryRaw<{ count: bigint }[]>`
                SELECT COUNT(DISTINCT c1.email) as count
                FROM Client c1
                LEFT JOIN project p ON p.client_id = c1.id
                WHERE 
                    (c1.company_id = ${String(company_id)} OR p.company_id = ${String(company_id)})
                    AND c1.date_creation >= ${startOfMonth}
                    AND c1.date_creation <= ${endOfMonth}
                    AND NOT EXISTS (
                        SELECT 1 FROM Client c2
                        LEFT JOIN project p2 ON p2.client_id = c2.id
                        WHERE c2.email = c1.email
                        AND (c2.company_id = ${String(company_id)} OR p2.company_id = ${String(company_id)})
                        AND c2.date_creation < ${startOfMonth}
                    )
            `;

            const currentMonthCount = Number(newClientsThisMonth[0].count);

            // Get paginated results with distinct emails
            const clients = await prisma.client.findMany({
                where: whereCondition,
                orderBy: [
                    { date_creation: 'desc' },
                    { name: 'asc' }
                ],
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    date_creation: true
                },
                distinct: ['email'],
                skip: pageNumber * itemsLimit,
                take: itemsLimit
            });

            const formattedClients = clients.map(({ id, name, email, phone }) => ({
                id,
                name,
                email,
                phone,
            }));

            // Get total raw count for duplicates check
            const rawCount = await prisma.client.count({ where: whereCondition });

            return res.json({
                total: totalCount,
                totalCurrentMonth: currentMonthCount,
                clients: formattedClients,
                duplicatesFound: totalCount !== rawCount
            });

        } catch (error) {
            console.error("Error listing clients:", error);
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
} 