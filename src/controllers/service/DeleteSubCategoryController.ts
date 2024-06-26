import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";


export class DeleteSubCategoryController {

    async handle(request: Request, response: Response) {
        try {
            const { sub_category_id } = request.body;

            // Verificação da existência da subcategoria
            const subCategory = await prisma.subCategory.findFirst({
                where: {
                    id: sub_category_id
                },
                include: {
                    service: true
                }
            });

            if (!subCategory) {
                throw new Error("Subcategory not found!");
            }

            // Exclusão de todos os serviços associados à subcategoria
            await prisma.service.deleteMany({
                where: {
                    sub_category_id: sub_category_id
                }
            });

            // Exclusão da subcategoria
            await prisma.subCategory.delete({
                where: {
                    id: sub_category_id
                }
            });

            return response.json();
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
