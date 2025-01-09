import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import S3Storage from "../../utils/S3/s3Storage";

export class DeleteCategoryController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    async deleteFiles(file: string) {

        const s3 = new S3Storage()
        await s3.deleteFile(file);
    }

    async handle(request: Request, response: Response) {
        try {
            const { category_id } = request.body;

            // Verificação da existência da categoria
            const category = await prisma.category.findFirst({
                where: {
                    id: category_id
                },
                include: {
                    sub_category: {
                        include: {
                            service: true
                        }
                    }
                }
            });

            if (!category) {
                throw new Error("Category not found!");
            }

            // Exclusão de todos os serviços associados a todas as subcategorias
            for (const subCategory of category.sub_category) {
                await prisma.service.deleteMany({
                    where: {
                        sub_category_id: subCategory.id
                    }
                });
                for (const service of subCategory.service) {
                    if (service.price_type === "FIXE" && service.price_fixe) {
                        this.deleteFiles(service.price_fixe.toString());
                    }
                    if (service.price_type === "VARIABLE" && service.price_minimum && service.price_maximum) {
                        this.deleteFiles(service.price_minimum.toString());
                        this.deleteFiles(service.price_maximum.toString());
                    }
                }
            }

            // Exclusão de todas as subcategorias associadas à categoria
            await prisma.subCategory.deleteMany({
                where: {
                    category_id: category_id
                }
            });

            // Exclusão da categoria
            await prisma.category.delete({
                where: {
                    id: category_id
                }
            });

            // Exclusão da imagem da categoria
            if (category.category_img) {
                this.deleteFiles(category.category_img);
            }

            return response.json({ message: "Category and its subcategories and services deleted successfully" });
        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });
        }
    }
}
