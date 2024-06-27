import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";

export class CreateCatalogController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/catalog/${file}`);
        deleteFile(`./public/tmp/catalog/${requestFile}`);
    }

    async handle(request: Request, response: Response) {
        try {
            const {
                catalog_name,
            } = request.body;

            if (!catalog_name) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                throw new Error("Category name and type are required!");
            }

            let file = "";
            if (request.file) {
                file = `${request.file.filename.split('.')[0]}.webp`;
            }

            const category = await prisma.catalog.findFirst({
                where: {
                    catalog_name: catalog_name,
                }
            });

            if (category) {
                this.deleteFiles(file, request.file?.filename);
                throw new Error("This category has already been registered!");
            }

            const result = await prisma.catalog.create({
                data: {
                    catalog_name,
                    catalog_img: file
                },
            });

            deleteFile(`./public/tmp/catalog/${request.file?.filename}`)

            return response.json(result);

        } catch (error) {
            //console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Erro interno do servidor" });

        }
    }
}
