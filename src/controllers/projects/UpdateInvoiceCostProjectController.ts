import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { getImageDimensions } from "../../config/compressImage";
import multer from "multer";
import { uploadImageWebpToS3, uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";


const upload = multer({ dest: './public/tmp/costproject' }).single('file');
export class UpdateInvoiceCostProjectController {

    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/costproject/${file}`);
        deleteFile(`./public/tmp/costproject/${requestFile}`);
    }

    async handle(request: Request, response: Response) {
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            try {
                const {
                    id,
                } = request.params;

                if (!id) {
                    this.deleteFiles(String(request.file?.filename), request.file?.filename);
                    return response.status(404).json({ error: "id is requireed!!" });
                
                }

                const invoiceCostProject = await prisma.invoiceCostProject.findUnique({
                    where: {
                        id
                    }
                });

                if (!invoiceCostProject) {
                    this.deleteFiles(request.file?.filename?.split('.')[0] + '.webp', request.file?.filename);
                    return response.status(404).json({ error: "Invoice id is required!" });
                
                }
                const fileReq = request.file
                if (!fileReq) {
                    return response.status(400).json({ error: "File is required" });
                }
                let file = "";
                const filePath = `./public/tmp/costproject/${request.file?.filename}`;
                const dimensions = getImageDimensions(filePath);

                if (!dimensions) {
                    // não é img
                    file = await uploadFileToS3_2(fileReq, '');
                } else {
                    const bucket = `${process.env.AMAZON_S3_BUCKET}`
                    file = await uploadImageWebpToS3(filePath, bucket);
                    deleteFile(`./public/tmp/costproject/${request.file?.filename}`);
                }

                let result;
                if (
                    (!invoiceCostProject.original_file_name || invoiceCostProject.original_file_name)
                    && !request.file?.originalname
                ) {
                    result = await prisma.invoiceCostProject.update({
                        where: {
                            id
                        },
                        data: {
                            project_cost_invoice_exists: false,
                            original_file_name: null,
                            uri: null
                        },
                    });
                    deleteFile(`./public/tmp/costproject/${invoiceCostProject.uri}`)
                } else if ((invoiceCostProject.original_file_name || !invoiceCostProject.original_file_name)
                    && request.file?.originalname) {
                    result = await prisma.invoiceCostProject.update({
                        where: {
                            id
                        },
                        data: {
                            original_file_name: String(request.file?.originalname),
                            uri: file,
                            project_cost_invoice_exists: true,
                        },
                    });
                    // deleteFile(`./public/tmp/costproject/${request.file?.filename}`);
                    deleteFile(`./public/tmp/costproject/${invoiceCostProject.uri}`)
                }

                let formattedResult
                if (result) {
                    formattedResult = {
                        id: result.id,
                        original_file_name: result.original_file_name
                    };
                }


                return response.json(formattedResult);
            } catch (error) {
                if (error instanceof Error) {
                    return response.json({ error: error.message });
                }
                return response.status(500).json({ error: "Internal error" });
            }
        })
    }
}
