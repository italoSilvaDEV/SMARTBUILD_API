import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import multer from "multer";
import { uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";

const upload = multer({ dest: './public/tmp/category' }).single('file'); 
export class CreateCategoryController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/category/${file}`);
        deleteFile(`./public/tmp/category/${requestFile}`);
    }

    async handle(request: Request, response: Response) {
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            try {
                const {
                    category_name,
                    type_category,
                    company_id
                } = request.body;

                if (!category_name || !type_category) {
                    this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                    return response.status(400).json({ error: "Category name and type are required!" });
                
                }

                let file = "";
                if (request.file) {

                    const filePath = `./public/tmp/category/${request.file.filename}`;
                    const bucket = `${process.env.AMAZON_S3_BUCKET}`
                    file = await uploadImageWebpToS3(filePath, bucket);
                }

                const category = await prisma.category.findFirst({
                    where: {
                        category_name: category_name,
                        type_category: type_category
                    }
                });

                if (category) {
                    this.deleteFiles(file, request.file?.filename);
                    return response.status(400).json({ error: "This category has already been registered!" });
                
                }

                const result = await prisma.category.create({
                    data: {
                        category_name,
                        status_category: true,
                        type_category,
                        category_img: file,
                        company_id
                    },
                });

                deleteFile(`./public/tmp/category/${request.file?.filename}`)

                return response.json(result);

            } catch (error) {
                //console.error(error);
                if (error instanceof Error) {
                    return response.json({ error: error.message });
                }
                return response.json({ error: "Internal server error" });

            }
        })
    }
}
