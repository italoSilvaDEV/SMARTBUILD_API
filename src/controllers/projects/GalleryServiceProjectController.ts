import multer from "multer";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";
import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";

const upload = multer({ dest: './public/tmp/gallery' }).single('file');
export class GalleryProjectController {
    async create(request: Request, response: Response) {
        upload(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            const {
                serviceProjectId, type
            } = request.body;
            const file = request.file;

            if (!file) {
                return response.status(400).json({ error: 'Arquivo é obrigatório' });
            }
            try {
                const fileName = await uploadFileToS3(file, ''); // Usar a função reutilizável

                const project = await prisma.serviceProject.findUnique({
                    where: {
                        id: serviceProjectId
                    }
                })
                if (!project) {
                    throw Error("Invalid id!")
                }
                if (type === 'before') {
                    await prisma.galleryBefore.create({
                        data: {
                            serviceProjectId,
                            url: fileName
                        }
                    });
                }
                if (type === 'after') {
                    await prisma.galleryAfter.create({
                        data: {
                            serviceProjectId,
                            url: fileName
                        }
                    });
                }

                return response.json();
            } catch (error) {
                console.log(error)
                throw Error('Erro interno do servidor')
            }
        });
    }
    async find(request: Request, response: Response) {
        const { id } = request.params;

        try {
            const project = await prisma.serviceProject.findUnique({
                where: { id },
            });

            if (!project) {
                return response.status(404).json({ error: "Invalid id!" });
            }

            // Buscar galerias antes e depois
            const [galleryBefore, galleryAfter] = await Promise.all([
                prisma.galleryBefore.findMany({ where: { serviceProjectId: id } }),
                prisma.galleryAfter.findMany({ where: { serviceProjectId: id } }),
            ]);

            // Processar URLs com assincronismo
            const [responseBefore, responseAfter] = await Promise.all([
                Promise.all(
                    galleryBefore.map(async (i) => ({
                        id: i.id,
                        url: await getPresignedUrl(i.url),
                        date_creation: i.date_creation,
                    }))
                ),
                Promise.all(
                    galleryAfter.map(async (i) => ({
                        id: i.id,
                        url: await getPresignedUrl(i.url),
                        date_creation: i.date_creation,
                    }))
                ),
            ]);

            return response.status(200).json({
                galleryBefore: responseBefore,
                galleryAfter: responseAfter,
            });
        } catch (error) {
            return response.status(500).json({ error: "Erro interno do servidor." });
        }
    }

    async delete(request: Request, response: Response) {
        const { id, type } = request.body;

        try {
            if (type === 'before') {
                const existing = await prisma.galleryBefore.findUnique({
                    where: { id }
                });
                if (!existing) {
                    return response.status(404).json({ error: 'ID inválido ou não encontrado.' });
                }

                deleteFileFromS3(existing.url);

                await prisma.galleryBefore.delete({
                    where: { id }
                });

                return response.status(200).json({ message: 'Deletado com sucesso.' });
            }

            if (type === 'after') {
                const existing = await prisma.galleryAfter.findUnique({
                    where: { id }
                });
                if (!existing) {
                    return response.status(404).json({ error: 'ID inválido ou não encontrado.' });
                }

                deleteFileFromS3(existing.url);

                await prisma.galleryAfter.delete({
                    where: { id }
                });

                return response.status(200).json({ message: 'Deletado com sucesso.' });
            }

            return response.status(400).json({ error: 'Tipo inválido.' });
        } catch (error) {
            return response.status(500).json({ error: 'Erro interno do servidor.' });
        }
    }


}