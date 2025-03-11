import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import { deleteFile } from "../../config/file";
import multer from "multer";
import nodemailer from "nodemailer";
import { createPreviewContract } from "../../templateEmail/createPreviewContract";
import fs from "fs";

import path from "path";
import { uploadFileToS3_2 } from "../../utils/S3/uploadFIleS3";

const upload = multer({ dest: './public/tmp/pdfcontractproject' }).single('file');

interface AdditionalData {
    clientName: string;
    companyName: string;
    totalPrice: number;
    companyAvatar: string;  
    emailClient: string;
}

export class CreatePdContractfProjectController {
    constructor() {
        this.handle = this.handle.bind(this);
        this.deleteFiles = this.deleteFiles.bind(this);
    }

    deleteFiles(file: string) {
        deleteFile(`./public/tmp/pdfcontractproject/${file}`);
    }

    async handle(req: Request, res: Response) {
        upload(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: 'Error uploading file' });
            }
            
            try {
                const { 
                    projectId, 
                    clientName,
                    companyName,
                    totalPrice,
                    companyAvatar, 
                    emailClient,
                } = req.body;

                console.log("companyAvatar", companyAvatar)
                console.log("projectId", projectId)
                console.log("clientName", clientName)
                console.log("companyName", companyName)
                console.log("totalPrice", totalPrice)
                console.log("emailClient", emailClient) 

                const file = req.file;

                if (!file) {
                    return res.status(400).json({ error: "Pdf is required" });
                }

                if (!projectId) {
                    this.deleteFiles(file.filename);
                    return res.status(400).json({ error: "Project id is required" });
                }

                const fileName = await uploadFileToS3_2(file, '', false);
                console.log("fileName", fileName)
                const result = await prisma.contractProject.create({
                    data: {
                        original_file_name: fileName,
                        uri: fileName,
                        projectId: projectId
                    },
                });

                // Retornar resposta ao cliente imediatamente
                const formattedResult = {
                    id: result.id,
                    original_file_name: result.original_file_name
                };
                
                // Iniciar envio de e-mail em background com os dados recebidos
                const additionalData: AdditionalData = {
                    clientName,
                    companyName,
                    totalPrice: Number(totalPrice),
                    companyAvatar,
                    emailClient
                };
                
                this.sendEmailInBackground(additionalData, file.path);
                
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

    // Método para enviar e-mail em background
    private async sendEmailInBackground(additionalData: AdditionalData, pdfPath: string) {
        try {
            console.log("ENVIANDO EMAIL");
            const startTime = Date.now(); // Captura o tempo de início

            const SMTP_CONFIG = require("../../config/smtp");
            const transporter = nodemailer.createTransport({
                host: SMTP_CONFIG.host,
                port: SMTP_CONFIG.port,
                secure: SMTP_CONFIG.port === 465,
                auth: {
                    user: SMTP_CONFIG.user,
                    pass: SMTP_CONFIG.pass,
                },
                tls: { rejectUnauthorized: false },
            });

            const templateEmail = createPreviewContract(
                additionalData.clientName.toUpperCase(),
                additionalData.companyAvatar || "", // Logo URL do front-end
                additionalData.companyName,
                additionalData.totalPrice
            );

            await transporter.sendMail({
                from: SMTP_CONFIG.user,
                to: additionalData.emailClient, // Assumindo que o e-mail está no nome do cliente
                subject: `Contract for ${additionalData.clientName.toUpperCase()}`,
                html: templateEmail,
                attachments: [
                    {
                        filename: "contract.pdf",
                        content: fs.createReadStream(pdfPath) // Usar stream em vez de path
                    },
                ],
            });

            const endTime = Date.now(); // Captura o tempo de término
            const durationInSeconds = (endTime - startTime) / 1000; // Calcula a duração em segundos
            console.log(`Tempo total para enviar o e-mail: ${durationInSeconds} segundos`);

            // Deletar arquivo após envio
            this.deleteFiles(path.basename(pdfPath));
            console.log('Email sent successfully');
        } catch (error) {
            console.error('Error sending email:', error);
            this.deleteFiles(path.basename(pdfPath));
        }
    }
}
