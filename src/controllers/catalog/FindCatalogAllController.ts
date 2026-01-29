import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class FindCatalogAllController {
    async handle(request: Request, response: Response) {
        try {
            const { name, pag, company_id } = request.body;

                        const pageNumber = Number(pag) || 0;

            const result = await prisma.catalog.findMany({
                where: {
                    AND: [
                        { catalog_name: { contains: name } },
                        {company_id}
                    ]
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
                skip: pageNumber * 20,
                take: 20,
                orderBy: {
                    date_creation: "desc"
                },
            });
            const resultWithPresigned = await Promise.all(
                result.map(async (prev) => ({
                    ...prev,
                    catalog_img: prev.catalog_img ? await getPresignedUrl(prev.catalog_img) : null,
                    imgCatalog: await Promise.all(prev.imgCatalog.map(async(img)=>({
                        ...img,
                        uri: img.uri ? await getPresignedUrl(img.uri) : null, // Gera URL assinada
                    })) )
                }))
            );
            const total = await prisma.catalog.count({
                where: {
                    AND: [
                        { catalog_name: { contains: name } },
                        { company_id }
                    ]
                }
            });

            return response.json({ total, result: resultWithPresigned });
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
