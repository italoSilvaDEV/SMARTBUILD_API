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
            return response.status(401).json({ message: 'Token inválido' });
        }

        const decoded = decodeToken(token, String(secret));
        if (!decoded) {
            return response.status(401).json({ message: 'Erro ao decodificar token!' });
        }

        if (!subcategory_name) {
            return response.status(400).json({ message: 'subcategory is a required field!' });
        }

        try {
            const category = await prisma.category.findFirst({
                where: { id: category_id }
            });

            if (!category) {
                return response.status(404).json({ message: 'Invalid category!' });
            }

            const existingSubcategory = await prisma.subCategory.findFirst({
                where: {
                    subcategory_name,
                    category_id
                }
            });

            if (existingSubcategory) {
                return response.status(409).json({ message: 'This sub-category has already been registered in this category!' });
            }

            await prisma.subCategory.create({
                data: {
                    subcategory_name,
                    status_subcategory: status_subcategory === "true", // Ensure boolean value
                    category_id
                }
            });

            return response.status(201).json({ message: 'Sub-category created successfully' });

        } catch (error) {
            console.error(error);
            return response.status(500).json({ message: 'Internal server error' });
        }
    }
}
