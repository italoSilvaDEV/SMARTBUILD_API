import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";


export class UpdateCategoryTypeController {

    async handle(request: Request, response: Response) {
        try {
            const {
                id,
                category_name,
                type_category,
                status_category
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

            await prisma.category.update({
                where: {
                    id
                },
                data: {
                    category_name,
                    type_category,
                    status_category
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
