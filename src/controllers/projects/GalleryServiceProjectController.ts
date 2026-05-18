import multer from "multer";
import { uploadFileToS3 } from "../../utils/S3/uploadFIleS3";
import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFileFromS3 } from "../../utils/S3/deleteFileFromS3";
import { getPresignedUrl } from "../../utils/S3/getPresignedUrl";
import { sendEmail } from "../../utils/sendEmail";
import fs from "fs";
import { galleryEmail } from "../../templateEmail/galery";

const upload = multer({ dest: './public/tmp/gallery' }).single('file');

export class GalleryProjectController {
    async create(request: Request, response: Response) {
        upload(request, response, async (err) => {

            if (err) {
                return response.status(400).json({ error: 'Error uploading file' });
            }
            const {
                serviceProjectId,
                type,
                title,
                description
            } = request.body;

            const file = request.file;

            if (!file || !type) {
                return response.status(400).json({
                    error: 'Arquivo é obrigatório e tipo é obrigatório'
                });
            }
            try {
                const fileName = await uploadFileToS3(file, '');

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
                            url: fileName,
                            title,
                            description
                        }
                    });
                }
                if (type === 'after') {
                    await prisma.galleryAfter.create({
                        data: {
                            serviceProjectId,
                            url: fileName,
                            title,
                            description
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
        const {
            id
        } = request.params;

        try {
            const project = await prisma.serviceProject.findUnique({
                where: {
                    id
                }
            });

            if (!project) {
                return response.status(404).json({
                    error: "Invalid id!"
                });
            }

            const [galleryBefore, galleryAfter] = await Promise.all([
                prisma.galleryBefore.findMany({
                    where: {
                        serviceProjectId: id
                    }
                }),

                prisma.galleryAfter.findMany({
                    where: {
                        serviceProjectId: id
                    }
                }),
            ]);

            const [responseBefore, responseAfter] = await Promise.all([
                Promise.all(
                    galleryBefore.map(async (i) => ({
                        id: i.id,
                        url: await getPresignedUrl(i.url),
                        date_creation: i.date_creation,
                        title: i.title,
                        description: i.description,
                    }))
                ),
                Promise.all(
                    galleryAfter.map(async (i) => ({
                        id: i.id,
                        url: await getPresignedUrl(i.url),
                        date_creation: i.date_creation,
                        title: i.title,
                        description: i.description,
                    }))
                ),
            ]);

            return response.status(200).json({
                galleryBefore: responseBefore,
                galleryAfter: responseAfter,
            });
        } catch (error) {
            return response.status(500).json({
                error:
                    "Erro interno do servidor."
            });
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

    async sendEmail(req: Request, res: Response) {
        let attachmentFiles: Express.Multer.File[] = [];

        const cleanupTempFiles = (files: Express.Multer.File[]) => {
            if (files && files.length > 0) {
                files.forEach(file => {
                    try {
                        if (fs.existsSync(file.path)) {
                            fs.unlinkSync(file.path);
                        }
                    } catch (error) {
                        console.error(`Error deleting temporary file ${file.path}:`, error);
                    }
                });
            }
        };

        try {
            attachmentFiles = req.files as Express.Multer.File[];

            const {
                from,
                to,
                cc,
                bcc,
                subject,
                body,
                sendMeCopy,
                projectId,
                serviceName
            } = req.body;

            if (!to) {
                cleanupTempFiles(attachmentFiles);
                return res.status(400).json({
                    error: "Recipient email is required"
                });
            }

            if (!projectId) {
                return res.status(400).json({
                    error: "Project id is required"
                });
            }

            const project = await prisma.project.findUnique({
                where: {
                    id: projectId
                },
                select: {
                    client: {
                        select: {
                            name: true
                        }
                    },
                    company: {
                        select: {
                            avatar: true,
                            name: true,
                            email: true
                        }
                    }
                }
            });

            if (!project) {
                return res.status(400).json({
                    error: "Project not found"
                });
            }

            const validateFileType = (file: Express.Multer.File): boolean => {
                const allowedTypes = [
                    'image/jpeg',
                    'image/jpg',
                    'image/png',
                    'image/gif',
                    'image/bmp',
                    'image/webp',
                    'application/pdf'
                ];
                return allowedTypes.includes(file.mimetype);
            };

            if (attachmentFiles && attachmentFiles.length > 0) {
                const invalidFiles = attachmentFiles.filter(file => !validateFileType(file));
                if (invalidFiles.length > 0) {
                    cleanupTempFiles(attachmentFiles);
                    return res.status(400).json({
                        error: "Invalid file type. Only images (JPEG, PNG, GIF, BMP, WEBP) and PDF files are allowed.",
                        invalidFiles: invalidFiles.map(f => ({
                            name: f.originalname,
                            type: f.mimetype
                        }))
                    });
                }
            }

            const parseEmailList = (emailInput: any): string[] => {
                if (!emailInput) return [];

                if (typeof emailInput === 'string') {
                    try {
                        if (emailInput.startsWith('[') && emailInput.endsWith(']')) {
                            const parsed = JSON.parse(emailInput);
                            if (Array.isArray(parsed)) {
                                return parsed.filter(email => email && typeof email === 'string').map(email => email.trim());
                            }
                        }
                        return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
                    } catch (error) {
                        return emailInput.split(',').map((email: string) => email.trim()).filter(email => email);
                    }
                }

                if (Array.isArray(emailInput)) {
                    return emailInput.filter(email => email && typeof email === 'string').map(email => email.trim());
                }

                return [];
            };

            const dataEmail = {
                from: from || '',
                to: parseEmailList(to),
                cc: parseEmailList(cc),
                bcc: parseEmailList(bcc),
                sendMeCopy: sendMeCopy === 'true' || sendMeCopy === true,
                subject: subject || '',
                body: body || ''
            };

            if (!dataEmail.to || dataEmail.to.length === 0) {
                cleanupTempFiles(attachmentFiles);
                return res.status(400).json({ error: "Please provide at least one recipient email address" });
            }

            const results = [];

            const allRecipients = [
                ...dataEmail.to,
                ...dataEmail.cc,
                ...dataEmail.bcc
            ];

            if (dataEmail.sendMeCopy && dataEmail.from) {
                allRecipients.push(dataEmail.from);
            }

            const uniqueRecipients = [...new Set(allRecipients.filter(email => email && typeof email === 'string'))];

            try {
                const attachments = [];

                if (attachmentFiles && attachmentFiles.length > 0) {
                    console.log(`📎 Processing ${attachmentFiles.length} attachment(s)...`);
                    for (const file of attachmentFiles) {
                        try {
                            const fileBuffer = fs.readFileSync(file.path);
                            attachments.push({
                                filename: file.originalname,
                                content: fileBuffer.toString('base64'),
                                type: file.mimetype,
                                disposition: 'attachment'
                            });
                            console.log(`Processed attachment: ${file.originalname} (${file.mimetype})`);
                        } catch (error) {
                            console.error(`Error reading attachment file ${file.originalname}:`, error);
                        }
                    }
                }

                const urlLogo = project.company?.avatar ? await getPresignedUrl(project.company.avatar) : '';

                await sendEmail({
                    to: dataEmail.to,
                    replyTo: project.company?.email || dataEmail.from,
                    subject: dataEmail.subject || 'Gallery Shared',
                    html: galleryEmail(
                        project.client?.name || '',
                        urlLogo || '',
                        project.company?.name || '',
                        serviceName,
                        attachmentFiles.length,
                        dataEmail.body
                    ),
                    attachments: attachments as any
                });

                for (const recipient of uniqueRecipients) {
                    results.push({ email: recipient, status: "success" });
                }

            } catch (error: any) {
                console.error('Error sending gallery email:', error);

                for (const recipient of uniqueRecipients) {
                    results.push({ email: recipient, status: "error", message: error.message });
                }

                console.log(`Failed to send gallery email to ${uniqueRecipients.join(', ')}: ${error.message}`);
            } finally {
                cleanupTempFiles(attachmentFiles);
            }

            return res.json({
                success: results.some(r => r.status === "success"),
                results,
                dataEmail: {
                    to: dataEmail.to,
                    cc: dataEmail.cc,
                    bcc: dataEmail.bcc,
                    subject: dataEmail.subject,
                    sendMeCopy: dataEmail.sendMeCopy,
                    attachmentCount: attachmentFiles ? attachmentFiles.length : 0
                }
            });

        } catch (error) {
            console.error('Unexpected error in sendGalleryEmail:', error);
            cleanupTempFiles(attachmentFiles);
            return res.status(500).json({ error: "Failed to send gallery email" });
        }
    }

    private async verifySMTPConfig() {
        return true;
    }
}
