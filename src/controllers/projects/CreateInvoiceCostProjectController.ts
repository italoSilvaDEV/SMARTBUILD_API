import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { getImageDimensions } from "../../config/compressImage";

export class CreateInvoiceCostProjectController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/costproject/${file}`);
        deleteFile(`./public/tmp/costproject/${requestFile}`);
    }

    async handle(req: Request, res: Response) {
        try {
            const { project_id } = req.body;

            if (!project_id) {
                if (req.file) {
                    this.deleteFiles(req.file?.filename?.split('.')[0] + '.webp', req.file?.filename);
                }
                return res.status(400).json({ error: "Project identifier is required" });
            }

            let result;

            if (!req.file) {
                result = await prisma.invoiceCostProject.create({
                    data: {
                        project_cost_invoice_exists: false,
                        project_id: project_id
                    },
                });
            } else {
                let file = "";
                const filePath = `./public/tmp/costproject/${req.file.filename}`;
                const dimensions = getImageDimensions(filePath);

                if (!dimensions) {
                    // não é img
                    file = String(req.file.filename);
                } else {
                    deleteFile(`./public/tmp/costproject/${req.file.filename}`);
                    file = `${req.file.filename.split('.')[0]}.webp`;
                }

                result = await prisma.invoiceCostProject.create({
                    data: {
                        original_file_name: String(req.file.originalname),
                        uri: file,
                        project_cost_invoice_exists: true,
                        project_id: project_id
                    },
                });
                deleteFile(`./public/tmp/user/${req.file.filename}`);
            }

            const formattedResult = {
                id: result.id,
                original_file_name: result.original_file_name
            };

            return res.json(formattedResult);

        } catch (error) {
            if (error instanceof Error) {
                return res.status(500).json({ error: error.message });
            }
            return res.status(500).json({ error: "Internal error" });
        }
    }
}
