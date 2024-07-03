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
                    return response.status(400).json({ error: "Catalog id is required" });
                }

                let file = "";
                if (request.file) {
                    file = `${request.file.filename.split('.')[0]}.webp`;
                } else {
                    return response.status(400).json({ error: "Image file is required!" });
                }

                const catalog = await prisma.catalog.findUnique({
                    where: {
                        id: catalog_name,
                    }
                });

                if (catalog) {
                    this.deleteFiles(file, request.file?.filename);
                    return response.status(400).json({ error: "Catalog already exists!" });
                }

                const result = await prisma.catalog.create({
                    data: {
                        catalog_img: file,
                        catalog_name: catalog_name,
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
