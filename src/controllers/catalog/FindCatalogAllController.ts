import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindCatalogAllController {
    async handle(request: Request, response: Response) {
        try {
            const { catalog_name, pag } = request.body;

            const filtro: any = {};
            if (catalog_name) {
                filtro.catalog_name = { contains: catalog_name };
            }

            const pageNumber = Number(pag) || 0;

            const result = await prisma.catalog.findMany({
                where: filtro,
                select: {
                    id: true,
                    catalog_name: true,
                    catalog_img: true,
                    imgCatalog: {
                        select: {
                            id: true,
                            uri: true,
                        }
                    },
                },
                skip: pageNumber * 20,
                take: 20,
                orderBy: {
                    date_creation: "desc"
                },
            });

            const total = await prisma.catalog.count({
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
