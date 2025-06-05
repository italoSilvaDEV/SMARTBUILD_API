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

            // Modified query to ensure proper handling of duplicates and pagination using MySQL syntax
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
                LIMIT ${itemsLimit}
                OFFSET ${pageNumber * itemsLimit}
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
            console.error("Error listing clients:", error);
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal server error" });
        }
    }
} 