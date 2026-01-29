import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { getImageDimensions } from "../../config/compressImage";
import multer from "multer";
import { uploadFileToS3_2, uploadImageWebpToS3 } from "../../utils/S3/uploadFIleS3";
import mime from "mime-types";

const upload = multer({ dest: './public/tmp/costproject' }).single('file');
export class CreateInvoiceCostProjectController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string, requestFile: string | undefined) {
        deleteFile(`./public/tmp/costproject/${file}`);
        deleteFile(`./public/tmp/costproject/${requestFile}`);
    }

    // async handle(req: Request, res: Response) {
    //     upload(req, res, async (err) => {
    //         if (err) {
    //             return res.status(400).json({ error: 'Error uploading file' });
    //         }
    //         try {
    //             const { project_id } = req.body;
    //             let result;

    //             if (!req.file) {
    //                 result = await prisma.invoiceCostProject.create({
    //                     data: {
    //                         project_cost_invoice_exists: false,
    //                         project_id: project_id
    //                     },
    //                 });
    //             } else {
    //                 let file = "";
    //                 const filePath = `./public/tmp/costproject/${req.file.filename}`;
    //                 const dimensions = getImageDimensions(filePath);

    //                 if (!dimensions) {
    //                     // não é img
    //                     file = await uploadFileToS3_2(req.file, ''); // Usar a função reutilizável
    //                 } else {

    //                     file = await uploadImageWebpToS3(filePath, ''); // Usar a função reutilizável
                        
    //                 }
    //                 deleteFile(`./public/tmp/costproject/${req.file.filename}`);
    //                 result = await prisma.invoiceCostProject.create({
    //                     data: {
    //                         original_file_name: String(req.file.originalname),
    //                         uri: file,
    //                         project_cost_invoice_exists: true,
    //                         project_id: project_id
    //                     },
    //                 });
    //             }

    //             const formattedResult = {
    //                 id: result.id,
    //                 original_file_name: result.original_file_name
    //             };

    //             return res.json(formattedResult);

    //         } catch (error) {
    //             if (error instanceof Error) {
    //                 return res.status(500).json({ error: error.message });
    //             }
    //             return res.status(500).json({ error: "Internal error" });
    //         }
    //     })
    // }
    async handle(req: Request, res: Response) {
        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: "Error uploading file" });
            }
            try {
                const { project_id } = req.body;
                let result;

                if (!req.file) {
                    result = await prisma.invoiceCostProject.create({
                        data: {
                            project_cost_invoice_exists: false,
                            project_id: project_id,
                        },
                    });
                } else {
                    const filePath = `./public/tmp/costproject/${req.file.filename}`;
                    const fileMimeType = mime.lookup(req.file.originalname);

                    if (!fileMimeType) {
                        throw new Error("Unable to determine file MIME type.");
                    }


                    let file = "";

                    // Verifica se o arquivo é uma imagem
                    if (fileMimeType.startsWith("image/")) {
                        const dimensions = getImageDimensions(filePath);

                        if (!dimensions) {
                            throw new Error("Failed to process image dimensions.");
                        }

                        // Faz upload como imagem
                        file = await uploadImageWebpToS3(filePath, process.env.AMAZON_S3_BUCKET!);
                    } else if (fileMimeType === "application/pdf") {
                        // Faz upload como PDF
                        file = await uploadFileToS3_2(req.file, "");
                    } else {
                        throw new Error("Unsupported file type. Only images and PDFs are allowed.");

                    }

                    deleteFile(filePath);

                    result = await prisma.invoiceCostProject.create({
                        data: {
                            original_file_name: req.file.originalname,
                            uri: file,
                            project_cost_invoice_exists: true,
                            project_id: project_id,
                        },
                    });
                }

                const formattedResult = {
                    id: result.id,
                    original_file_name: result.original_file_name,
                };

                return res.json(formattedResult);

            } catch (error) {

                }
                return res.status(500).json({ error: "Internal error" });

            }
        });
    }

}
