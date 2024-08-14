import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { getImageDimensions } from "../../config/compressImage";


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

            let file = "";
            const filePath = `./public/tmp/costproject/${request.file?.filename}`;
            const dimensions = getImageDimensions(filePath);

            if (!dimensions) {
                // não é img
                file = String(request.file?.filename);
            } else {
                deleteFile(`./public/tmp/costproject/${request.file?.filename}`);
                file = `${request.file?.filename.split('.')[0]}.webp`;
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


    }
}
