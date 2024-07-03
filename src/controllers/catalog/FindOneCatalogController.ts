import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindOneCatalogController {
    async handle(request: Request, response: Response) {
        try {

            let { id } = request.params
            const catalog = await prisma.catalog.findUnique({
                where: { id }
            });

            if (!catalog) {
                throw Error("Catalogo not found!");
            }
            const result = await prisma.catalog.findUnique({
                where: {
                    id
                },
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
            })

            return response.json(result)
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }

    };
}