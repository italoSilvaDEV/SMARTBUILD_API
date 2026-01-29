import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class FindSubCategoryController {

    async handle(request: Request, response: Response) {
        try {
            const { category_id } = request.body;

            if (!category_id) {
                throw new Error("Category ID is required!");
            }

            const subCategories = await prisma.subCategory.findMany({
                where: {
                    category_id: category_id
                },
                select: {
                    subcategory_name: true,
                    status_subcategory: true,
                    category_id: true,
                }
            });

            return response.json(subCategories);
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
