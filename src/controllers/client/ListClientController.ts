import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class ListClientController {
    async handle(req: Request, res: Response) {
        try {
            const { company_id, page = 1, itemsPerPage = 10, search = "" } = req.query;
            
            if (!company_id) {
                return res.status(400).json({ error: "Company ID is required" });
            }

            const pageNumber = Number(page) > 0 ? Number(page) - 1 : 0;
            const itemsLimit = Number(itemsPerPage);

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

            // Get distinct clients by email (prioritizing the most recent one)
            const distinctClients = await prisma.client.groupBy({
                by: ['email'],
                where: whereCondition,
                _count: {
                    _all: true
                },
                having: {
                    email: {
                        _count: {
                            gt: 0
                        }
                    }
                }
            });

            const totalCount = distinctClients.length;

            // Get paginated results with distinct emails
            const clients = await prisma.client.findMany({
                where: whereCondition,
                orderBy: [
                    { date_creation: 'desc' }, // Get most recent record for each email
                    { name: 'asc' }
                ],
                select: {
                    id: true,
                    name: true,
                    email: true,
                    phone: true,
                    date_creation: true
                },
                distinct: ['email'], // Ensure we get unique emails
                skip: pageNumber * itemsLimit,
                take: itemsLimit
            });

            // Format the response
            const formattedClients = clients.map(({ id, name, email, phone }) => ({
                id,
                name,
                email,
                phone,
            }));

            return res.json({
                total: totalCount,
                clients: formattedClients,
                duplicatesFound: totalCount !== await prisma.client.count({ where: whereCondition })
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