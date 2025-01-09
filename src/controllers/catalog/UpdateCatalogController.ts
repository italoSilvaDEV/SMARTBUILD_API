import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import multer from "multer";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";
import S3Storage from "../../utils/S3/s3Storage";

const upload = multer({ dest: './public/tmp/catalog' }).single('file');
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
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            try {
                const { catalog_name, id } = request.body;

                const s3 = new S3Storage()
                if (!catalog_name) {
                   
                    return response.status(400).json({ error: "Catalog name is required!" });
                }

                let file = "";
                if (request.file) {
                    const filePath = `./public/tmp/catalog/${request.file.filename}`;
                    file = await uploadImageWebpToS3(filePath, '');
                }

                const catalog = await prisma.catalog.findUnique({
                    where: {
                        id,
                    },
                });

                if (!catalog) {
                    if (request.file) {
                        this.deleteFiles(request.file.filename.split('.')[0] + '.webp', request.file.filename);
                    }

                    await s3.deleteFile(file);
                    return response.status(400).json({ error: "Catalog not found!" });
                }

                if (catalog.catalog_name !== catalog_name) {
                    const catalogWithName = await prisma.catalog.findUnique({
                        where: {
                            catalog_name: catalog_name,
                        },
                    });
                    if (catalogWithName) {
                        if (request.file) {
                            this.deleteFiles(request.file.filename.split('.')[0] + '.webp', request.file.filename);
                        }

                        await s3.deleteFile(file);
                        return response.status(400).json({ error: "Catalog name already exists!" });
                    }
                }

                const updatedData: any = {
                    catalog_name: catalog_name,
                };

                if (file) {
                    updatedData.catalog_img = file;
                }

                const updatedCatalog = await prisma.catalog.update({
                    where: {
                        id,
                    },
                    data: updatedData,
                });

                if (file && catalog.catalog_img) {
                    deleteFile(`./public/tmp/catalog/${catalog.catalog_img}`);
                }
                if (request.file) {
                    deleteFile(`./public/tmp/catalog/${request.file.filename}`);
                }

                return response.json(updatedCatalog);
            } catch (error) {
                if (error instanceof Error) {
                    return response.status(500).json({ error: error.message });
                }
                return response.status(500).json({ error: "Internal server error" });
            }
        })
    }
}
