import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { decodeToken } from "../../config/decodeToken";

export class UpdateCategoryController {

    async handle(request: Request, response: Response) {
        try {
            const {
                id,
                category_name,
                type_category,
            } = request.body;

            if (!id || !category_name || !type_category) {
                throw new Error("ID, category name and type category are required!");
            }

            const result_category = await prisma.category.findUnique({
                where: {
                    id
                }
            });

            if (!result_category) {
                throw new Error("Invalid category identifier!");
            }

            if (result_category.category_name === category_name && 
                result_category.type_category === type_category) {
                return response.json();
            }

            const existingCategory = await prisma.category.findFirst({
                where: {
                    category_name: category_name,
                    type_category: type_category
                }
            });

            if (existingCategory) {
                throw new Error("This category has already been registered!");
            }

            await prisma.category.update({
                where: {
                    id
                },
                data: {
                    category_name,
                    type_category
                },
            });

            return response.json();

        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
