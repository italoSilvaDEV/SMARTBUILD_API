import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";

export class UpdateImgCategoryController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/category/${file}`);
        if (requestFile) {
            deleteFile(`./public/tmp/category/${requestFile}`);
        }
    }

    async handle(request: Request, response: Response) {
        try {
            const { id, category_name } = request.body;

            if (!id || !category_name) {
                throw new Error("ID and category name are required!");
            }
            const category = await prisma.category.findUnique({
                where: { id }
            });

            if (!category) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                throw new Error("Category not found!");
            }

            let file = "";
            if (request.file?.filename) {
                file = `${request.file.filename.split('.')[0]}.webp`;
                await prisma.category.update({
                    where: { id },
                    data: {
                        category_img: file,
                        category_name
                    }
                });

                // Delete old category image
                if (category.category_img) {
                    deleteFile(`./public/tmp/category/${category.category_img}`);
                }
            } else {
                await prisma.category.update({
                    where: { id },
                    data: { category_name }
                });
            }

            return response.status(200).json({ message: "Category updated successfully" });
        } catch (error) {
            if (error instanceof Error) {
                return response.status(400).json({ error: error.message });
            }
            return response.status(500).json({ error: "Internal error" });
        }
    }
    async handleName(request: Request, response: Response) {
        try {
            const { id, category_name, type_category } = request.body;

            if (!id || !category_name) {
                return response.status(400).json({ error: "ID and category name are required!" });
            }
            const category = await prisma.category.findUnique({
                where: { id }
            });

            if (!category) {
                return response.status(400).json({ error: "Category not found!" });
            }

            if (category.category_name === category_name) {
                return response.json({});
            }else if(category.category_name !== category_name){
                const existingCategory = await prisma.category.findFirst({
                    where: {
                        category_name: category_name,
                        type_category: type_category,
                    }
                });
                if (existingCategory) {
                    return response.status(400).json({ error: "This category has already been registered!" });
                }
            }

            await prisma.category.update({
                where: { id },
                data: { category_name }
            });

            return response.status(200).json({ message: "Category updated successfully" });
        } catch (error) {
            if (error instanceof Error) {
                return response.status(400).json({ error: error.message });
            }
            return response.status(500).json({ error: "Internal error" });
        }
    }

    async handleStatus(request: Request, response: Response) {
        try {
            const { id, status_category } = request.body;

            if (!id ) {
                throw new Error("ID are required!");
            }
            const category = await prisma.category.findUnique({
                where: { id }
            });

            if (!category) {
                throw new Error("Category not found!");
            }


            await prisma.category.update({
                where: { id },
                data: { status_category }
            });

            return response.status(200).json({ message: "Category updated successfully" });
        } catch (error) {
            if (error instanceof Error) {
                return response.status(400).json({ error: error.message });
            }
            return response.status(500).json({ error: "Internal error" });
        }
    }
    

}
