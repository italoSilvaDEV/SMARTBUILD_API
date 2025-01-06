import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { getImageDimensions } from "../../config/compressImage";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";
import multer from "multer";

const upload = multer({ dest: './public/tmp/pdfproject' }).single('file');
export class CreatePdfProjectController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/pdfproject/${file}`);
    }

    async handle(req: Request, res: Response) {

        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: 'Erro no upload do arquivo' });
            }
            try {
                const { project_id } = req.body;

                

                const file = req.file;
              

                if (!file) {
                    return res.status(400).json({ error: "Pdf is required" });
                }
                const fileName = await uploadFileToS3_2(file, ''); // Usar a função reutilizável
                if (!project_id) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "Project id is required" });
                }

                const project = await prisma.project.findUnique({
                    where: {
                        id: project_id
                    }
                });

                if (!project) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "project does not exist" });
                }

                // Remove a extensão .pdf do nome do arquivo
                const originalFileName = file.filename;

                function removeHashFromFileName(fileName: string): string {
                    const hashRegex = /^[a-f0-9]{32}-/i; // Regex para detectar e remover o hash
                    return fileName.replace(hashRegex, '');
                }
           

                const result = await prisma.pdfProject.create({
                    data: {
                        original_file_name: fileName,
                        uri: fileName,
                        project_id: project_id
                    },
                });

                const formattedResult = {
                    id: result.id,
                    original_file_name: result.original_file_name
                };

                return res.json(formattedResult);
            } catch (error) {
                if (req.file) {
                    this.deleteFiles(req.file.filename);
                }
                if (error instanceof Error) {
                    return res.status(500).json({ error: error.message });
                }
                return res.status(500).json({ error: "Internal error" });
            }
        });
    }
}
