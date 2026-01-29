import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

export class FindCategoriesController {
    async handle(request: Request, response: Response) {
        try {
            const {
                company_id,
            } = request.body;

            if (!company_id) {
                return response.status(400).json({
                    error: "Company ID is required!"
                });
            }

            const categories = await prisma.category.findMany({
                where: {
                    company_id: company_id
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

            const categoriesWithServiceCount = categories.map(category => ({
                ...category,
                totalServices: category.sub_category.reduce((total, subCategory) => {
                    return total + (subCategory.service ? subCategory.service.length : 0);
                }, 0)
            })).sort((a, b) => b.totalServices - a.totalServices);

            const resultWithPresigned = await Promise.all(
                categoriesWithServiceCount.map(async (prev) => {
                    const { totalServices, ...categoryWithoutCount } = prev;
                    return {
                        ...categoryWithoutCount,
                        category_img: prev.category_img ? await getPresignedUrl(prev.category_img) : null,
                    };
                })
            );


            return response.status(200).json(
                resultWithPresigned
            );
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
