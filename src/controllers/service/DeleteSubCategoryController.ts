import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";


export class DeleteSubCategoryController {

    async handle(request: Request, response: Response) {
        try {
            const { sub_category_id } = request.params;

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
                return response.status(400).json({ message: 'Subcategory not found!' });
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
            // console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.status(500).json({ message: 'Internal server error' });
        }
    }
}
