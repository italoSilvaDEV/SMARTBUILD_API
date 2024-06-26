import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { decodeToken } from "../../config/decodeToken";


export class CreateSubCategoryController {


    async handle(request: Request, response: Response) {

        try {
            const {
                subcategory_name,
                status_subcategory,
                category_id
            } = request.body

            const authHeader = request.headers.authorization;
            const token = authHeader && authHeader.split(" ")[1]
            const secret = process.env.SECRET_JWT;

            if (!token) {
                return response.status(401).json({ message: 'Token inválido' });
            }

            const decoded = decodeToken(token, String(secret));
            if (!decoded) {
                throw Error("Erro ao decodificar token!")
            }

            if (!subcategory_name) {
                throw Error("subcategory is a required field!");
            }

            const category = await prisma.category.findFirst({
                where: {
                    id: category_id
                }
            });

            if (!category) {
                throw Error("Invalid category!")
            }
            //verificar se a subcategoria ja existe dentro dessa categoria
            const subcategory = await prisma.subCategory.findFirst({
                where: {
                    subcategory_name: subcategory_name,
                    category_id: category_id
                }
            });

            if (subcategory) {
                throw Error("This sub-category has already been registered in this category!");
            }

            await prisma.subCategory.create({
                data: {
                    subcategory_name,
                    status_subcategory,
                    category_id
                }
            });

            return response.json();
        } catch (error) {
            //console.error(error);]
            if (error instanceof Error) {
                return response.json({ error: error.message })
            }
            return response.json({ error: "Erro interno do servidor" });
        }


    }
}