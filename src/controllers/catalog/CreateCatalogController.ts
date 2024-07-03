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
            const { catalog_name } = request.body;

            if (!catalog_name) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                return response.status(400).json({ error: "Catalog name is required" });
            }

            let file = "";
            if (request.file) {
                file = `${request.file.filename.split('.')[0]}.webp`;
            } else {
                return response.status(400).json({ error: "Image file is required!" });
            }

            // Verificação de Existência do Catálogo pelo Nome
            const catalogExists = await prisma.catalog.findFirst({
                where: {
                    catalog_name: catalog_name,
                }
            });

            if (catalogExists) {
                this.deleteFiles(file, request.file?.filename);
                return response.status(400).json({ error: "Catalog already exists!" });
            }

            // Criação do Catálogo
            const result = await prisma.catalog.create({
                data: {
                    catalog_img: file,
                    catalog_name: catalog_name,
                },
            });

            // Remover o arquivo temporário
            deleteFile(`./public/tmp/catalog/${request.file?.filename}`);

            return response.json(result);

        } catch (error) {
            console.error(error);
            if (error instanceof Error) {
                return response.status(500).json({ error: error.message });
            }
            return response.status(500).json({ error: "Internal server error" });
        }
    }
}
