import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import { getImageDimensions } from "../../config/compressImage";

export class CreatePdfProjectController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/pdfproject/${file}`);
    }

    async handle(req: Request, res: Response) {
        try {
            const { project_id } = req.body;

           let file = "";
            const filePath = `./public/tmp/pdfproject/${req.file?.filename}`;
            const dimensions = getImageDimensions(filePath);

            if (!dimensions) {
                // não é img
                file = String(req.file?.filename);
            } else{
                if(req.file?.filename)
                this.deleteFiles(req.file?.filename);
                return res.status(400).json({ error: "Project identifier is required" });
            }

            if (!req.file) {
                return res.status(400).json({ error: "Pdf is required" });
            }

            if (!project_id) {
                this.deleteFiles(req.file.filename);
                return res.status(400).json({ error: "Project id is required" });
            }

            const project = await prisma.project.findUnique({
                where:{
                    id: project_id
                }
            })

            if(!project){
                this.deleteFiles(req.file.filename);
                return res.status(400).json({ error: "project does not exist" });
            }
            // const file = req.file.filename;
            const originalFileName = req.file.originalname;

            const result = await prisma.pdfProject.create({
                data: {
                    original_file_name: originalFileName,
                    uri: file,
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
    }
}
