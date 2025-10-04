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
                error: "Audio blob, model and response format are required"
            });
        }

        try {
            const response = await openAi.audio.transcriptions.create({
                file: fs.createReadStream(file.path),
                model: "whisper-1",
                response_format: "text",
                prompt: OpenIaPrompt.transcribeAudio()
            })

            fs.unlink(file.path, (err) => {
                if (err) console.error("Error deleting temp file:", err);
            });

            return res.status(200).json({
                data: {
                    text: response,
                }
            });
        } catch (error) {
            console.error("Transcription error:", error);
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}