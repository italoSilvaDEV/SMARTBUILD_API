import { Request, Response } from "express";
import OpenAI from "openai";
import { OpenIaPrompt } from "../../utils/openIaPrompt";
import fs from "fs"

const openAi = new OpenAI({
    apiKey: process.env.OPENAI_KEY,
});

export class OpenIAController {
    async generateDescription(req: Request, res: Response) {
        const {
            serviceName,
            description,
            categoryName
        } = req.body

        if (!serviceName || !description) {
            return res.status(400).json({
                error: "Service name and description are required"
            });
        }

        try {
            const response = await openAi.chat.completions.create({
                model: "gpt-4.1-nano",
                messages: [{
                    role: "user",
                    content: OpenIaPrompt.switch(categoryName ? "generateDescriptionCategory" : "generateDescription", serviceName, description, categoryName)
                }],
                temperature: 0.7,
            });

            return res.status(200).json({
                data: {
                    text: response.choices[0].message.content
                }
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }

    async incrementDescription(req: Request, res: Response) {
        const {
            serviceName,
            quantity,
            price,
            description,
            categoryName
        } = req.body

        if (!serviceName || !quantity || !price || !description) {
            return res.status(400).json({
                error: "Service name, quantity, price and description are required"
            });
        }

        try {
            const response = await openAi.chat.completions.create({
                model: "gpt-4.1-nano",
                messages: [{
                    role: "user",
                    content: OpenIaPrompt.switch(categoryName ? "incrementDescriptionCategory" : "incrementDescription", serviceName, quantity, price, description, categoryName)
                }],
                temperature: 0.7,
            });

            return res.status(200).json({
                data: {
                    text: response.choices[0].message.content
                }
            });
        } catch (error) {
            console.error(error);
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }

    async transcribeAudio(req: Request, res: Response) {
        const file = req.file

        if (!file) {
            return res.status(400).json({
                error: "Audio file is required"
            });
        }

        const mimeToExt: { [key: string]: string } = {
            'audio/mpeg': '.mp3',
            'audio/mp3': '.mp3',
            'audio/wav': '.wav',
            'audio/wave': '.wav',
            'audio/x-wav': '.wav',
            'audio/webm': '.webm',
            'audio/ogg': '.ogg',
            'audio/flac': '.flac',
            'audio/m4a': '.m4a',
            'audio/mp4': '.mp4',
            'video/mp4': '.mp4',
            'video/mpeg': '.mpeg',
        };

        let filePath = file.path;

        if (!file.originalname.includes('.') && file.mimetype && mimeToExt[file.mimetype]) {
            const newPath = file.path + mimeToExt[file.mimetype];
            fs.renameSync(file.path, newPath);
            filePath = newPath;
        }

        try {
            const response = await openAi.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",
                response_format: "text",
                prompt: OpenIaPrompt.transcribeAudio()
            })

            fs.unlink(filePath, (err) => {
                if (err) console.error("Error deleting temp file:", err);
            });

            return res.status(200).json({
                data: {
                    text: response,
                }
            });
        } catch (error: any) {
            console.error("Transcription error:", error);
            
            if (filePath) {
                fs.unlink(filePath, (err) => {
                    if (err) console.error("Error deleting temp file after error:", err);
                });
            }

            return res.status(500).json({
                error: "Internal server error",
                details: error?.message || "Unknown error"
            });
        }
    }
}