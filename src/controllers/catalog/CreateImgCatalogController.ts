import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import multer from "multer";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";

const upload = multer({ dest: './public/tmp/catalogimg' }).single('file');
export class CreateImgCatalogController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/catalogimg/${file}`);
        deleteFile(`./public/tmp/catalogimg/${requestFile}`);
    }

    async handle(request: Request, response: Response) {
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            try {
                const {
                    catalog_id,
                } = request.body;

                if (!catalog_id) {
                    this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                    return response.status(400).json({ error: "Catalog id is required" });
                }

                let file = "";
                if (request.file) {
                    const filePath = `./public/tmp/catalogimg/${request.file.filename}`;
                    const bucket = `${process.env.AMAZON_S3_BUCKET}`
                    file = await uploadImageWebpToS3(filePath, bucket);
                } else {
                    return response.status(400).json({ error: "Image file is required!" });
                }

                const category = await prisma.catalog.findUnique({
                    where: {
                        id: catalog_id,
                    }
                });

                if (!category) {
                    this.deleteFiles(file, request.file?.filename);
                    return response.status(400).json({ error: "Catalog not found!" });
                }

                const result = await prisma.imgCatalog.create({
                    data: {
                        uri: file,
                        catalog_id: catalog_id,
                    },
                });

                deleteFile(`./public/tmp/catalogimg/${request.file?.filename}`);

                return response.json(result);

            } catch (error) {
                // console.error(error);
                if (error instanceof Error) {
                    return response.json({ error: error.message });
                }
                return response.json({ error: "Internal server error" });
            }
        })
    }
}
