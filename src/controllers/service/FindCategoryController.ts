import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class FindCategoriesController {

    async handle(request: Request, response: Response) {
        try {
            const { type_category, search } = request.body;

            if (!type_category) {
                throw new Error("Type category is required!");
            }

            const filtro: any = {
                type_category: { equals: type_category }
            };

            if (search) {
                filtro.OR = [
                    { category_name: { contains: search } },
                    { sub_category: { some: { service: { some: { service_name: { contains: search } } } } } }
                ];
            }

            const categories = await prisma.category.findMany({
                where: filtro,
                select: {
                    id: true,
                    type_category: true,
                    category_img: true,
                    status_category: true,
                    category_name: true,
                    sub_category: {
                        select: {
                            id: true,
                            subcategory_name: true,
                            service: true
                        }
                    }
                }
            });
            const resultWithPresigned = await Promise.all(
                categories.map(async (prev) => ({
                    ...prev,
                    category_img: prev.category_img ? await getPresignedUrl(prev.category_img) : null, // Gera URL assinada
                }))
            );


            return response.json(resultWithPresigned);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
