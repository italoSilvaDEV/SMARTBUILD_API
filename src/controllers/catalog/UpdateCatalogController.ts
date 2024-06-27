import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";


export class UpdateCatalogController {

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
                id,
            } = request.params;

            const {
                catalog_name,
            } = request.body

            let file = ""
            file = `${request.file?.filename.split('.')[0]}.webp`;

            if (!catalog_name) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                throw new Error("Catalog name is required!");
            }

            const catalog = await prisma.catalog.findUnique({
                where: {
                    id
                }
            });

            if (!catalog) {
                this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                throw new Error("Catalog name and type are required!");
            }


            await prisma.catalog.update({
                where: {
                    id
                },
                data: {
                    catalog_img: file
                }
            })

            if (catalog) {
                deleteFile(`./public/tmp/catalog/${catalog.catalog_img}`)
            }
            deleteFile(`./public/tmp/catalog/${request.file?.filename}`)

            return response.json();
        } catch (error) {
            if (error instanceof Error) {
                return response.json({ error: error.message });
            }
            return response.json({ error: "Internal error" });
        }


    }
}
