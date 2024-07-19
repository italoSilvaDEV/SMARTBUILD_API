import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { decodeToken } from "../../config/decodeToken";

export class CreateSubCategoryController {
    async handle(request: Request, response: Response) {
        const { subcategory_name, status_subcategory, category_id } = request.body;
        const authHeader = request.headers.authorization;
        const token = authHeader && authHeader.split(" ")[1];
        const secret = process.env.SECRET_JWT;

        if (!token) {
            return response.status(401).json({ error: 'Token inválido' });
        }

        const decoded = decodeToken(token, String(secret));
        if (!decoded) {
            return response.status(401).json({ error: 'Erro ao decodificar token!' });
        }

        if (!subcategory_name) {
            return response.status(400).json({ error: 'subcategory is a required field!' });
        }

        try {
            const category = await prisma.category.findFirst({
                where: { id: category_id }
            });

            if (!category) {
                return response.status(404).json({ error: 'Invalid category!' });
            }

            const existingSubcategory = await prisma.subCategory.findFirst({
                where: {
                    subcategory_name,
                    category_id
                }
            }); 

            if (existingSubcategory) {
                return response.status(400).json({ error: 'This sub-category has already been registered in this category!' });
            }

            const result = await prisma.subCategory.create({
                data: {
                    subcategory_name,
                    status_subcategory: status_subcategory === "true", // Ensure boolean value
                    category_id
                }
            });

            return response.status(201).json(result);

        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal server error" });
        }
    }
}
