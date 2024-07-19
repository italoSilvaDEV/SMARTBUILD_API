import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class UpdateSubCategoryController {

    async handle(request: Request, response: Response) {
        try {
            const {
                category_id,
                subcategory_id,
                subcategory_name,
                status_subcategory,
                type_category
            } = request.body;
 
            if (!category_id || !subcategory_id || !subcategory_name || !type_category) {
                return response.status(400).json({ error: "All fields are required!" });
            }

            const category = await prisma.category.findFirst({
                where: {
                    id: category_id
                }
            });

            if (!category) {
                return response.status(400).json({ error: "Invalid category!" });
                
            }

            const subcategory = await prisma.subCategory.findUnique({
                where: {
                    id: subcategory_id
                },
            });

            if (!subcategory) {
                return response.status(400).json({ error: "Invalid subcategory!" });
                
            }

            // Se não houver mudanças, retorne sem atualizar
            if (subcategory.subcategory_name === subcategory_name) {
                return response.json({});
            }else if(subcategory_name !== subcategory.subcategory_name){
                const existingSubcategory = await prisma.subCategory.findFirst({
                    where: {
                        subcategory_name: subcategory_name,
                        category_id: category_id,
                        subcategory: {
                            type_category: type_category
                        }
                    }
                });
                if (existingSubcategory) {
                    return response.status(400).json({ error: "This sub-category has already been registered !" });
                }
            }

            // Atualize a subcategoria
            await prisma.subCategory.update({
                where: {
                    id: subcategory_id
                },
                data: {
                    subcategory_name,
                    status_subcategory,
                }
            });

            return response.json();
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal server error" });
        }
    }
}
