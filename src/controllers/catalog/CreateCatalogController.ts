import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import multer from "multer";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";

const upload = multer({ dest: './public/tmp/catalog' }).single('file');
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
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            try {
                const { catalog_name, company_id } = request.body;

                if (!catalog_name) {
                    return response.status(400).json({ error: "Catalog name is required" });
                }

                let file = "";
                if (request.file) {
                    const filePath = `./public/tmp/catalog/${request.file.filename}`;
                    
                    const bucket = `${process.env.AMAZON_S3_BUCKET}`
                    file = await uploadImageWebpToS3(filePath, bucket);
                } else {
                    return response.status(400).json({ error: "Image file is required!" });
                }

                // Verificação de Existência do Catálogo pelo Nome
                const catalogExists = await prisma.catalog.findFirst({
                    where: {
                        AND: [
                            {
                                catalog_name: catalog_name,
                            },
                            {
                                company_id
                            }
                        ]
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
                        company_id
                    },
                });

                // Remover o arquivo temporário
                deleteFile(`./public/tmp/catalog/${request.file?.filename}`);

                return response.json(result);

            } catch (error) {
                // console.error(error);
                if (error instanceof Error) {
                    return response.status(500).json({ error: error.message });
                }
                return response.status(500).json({ error: "Internal server error" });
            }
        })
    }
}
