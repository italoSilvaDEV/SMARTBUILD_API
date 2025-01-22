import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

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
            const resultWithPresigned = {
                ...result,
                catalog_img: result && result.catalog_img ? await getPresignedUrl(result.catalog_img) : null,
                imgCatalog: result && await Promise.all(result.imgCatalog.map(async (img) => ({
                    ...img,
                    uri: img.uri ? await getPresignedUrl(img.uri) : null, // Gera URL assinada
                })))
            }
            return response.json(resultWithPresigned)
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }

    };
}