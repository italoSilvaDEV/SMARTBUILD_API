import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindWorkedHoursProjectController {
    async handle(request: Request, response: Response) {
        try {
            const { project_id, name_user, pag } = request.body;

            if (!project_id) {
                return response.status(400).json({ error: "Project ID is required" });
            }

            const filtro: any = { project_id };

            if (name_user) {
                filtro.name_user = { contains: name_user };
            }

            const pageNumber = Number(pag) || 0;

            const result = await prisma.workedhours.findMany({
                where: filtro,
                select: {
                    id: true,
                    project_id: true,
                    name_user: true,
                    amount_of_hours: true,
                    hourly_price: true,
                },
                skip: pageNumber * 20,
                take: 20,
                orderBy: {
                    date_creation: "desc"
                },
            });

            const total = await prisma.workedhours.count({
                where: filtro
            });

            return response.json({ total, result });
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
