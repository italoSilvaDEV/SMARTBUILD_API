import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";

export class CreateImgCatalogController {

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
                catalog_id,
            } = request.body;

            if (!catalog_id) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                throw new Error("Catalog id is required!");
            }

            let file = "";
            if (request.file) {
                file = `${request.file.filename.split('.')[0]}.webp`;
            } else {
                throw new Error("Image file is required!");
            }

            const category = await prisma.catalog.findUnique({
                where: {
                    id: catalog_id,
                }
            });

            if (!category) {
                this.deleteFiles(file, request.file?.filename);
                throw new Error("Catalog not found!");
            }

            const result = await prisma.imgCatalog.create({
                data: {
                    uri: file,
                    catalog_id: catalog_id,
                },
            });

            deleteFile(`./public/tmp/catalog/${request.file?.filename}`);

            return response.json(result);

        } catch (error) {
            // console.error(error);
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal server error" });
        }
    }
}
