import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindCategoriesController {

    async handle(request: Request, response: Response) {
        try {
            const { type_category } = request.body;

            if (!type_category) {
                throw new Error("Type category is required!");
            }

            const categories = await prisma.category.findMany({
                where: {
                    type_category: type_category
                },
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

            return response.json(categories);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
