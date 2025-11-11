import { Request, Response } from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { OpenIaPrompt } from '../../utils/openIaPrompt';
import fs from 'fs';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY
});

const AUDIO_CONFIG = {
    MAX_SIZE: 25 * 1024 * 1024,
    VALID_EXTENSIONS: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    MODEL: 'whisper-1',
    LANGUAGE: 'pt'
} as const;

const GPT_CONFIG = {
    MODEL: 'gpt-4o-mini',
    TEMPERATURE: 0.4,
    MAX_TOKENS: 800,
    MAX_TEXT_LENGTH: 5000
} as const;

export class OpenAIController {
    private validateAudioFile(file: Express.Multer.File): { valid: boolean; error?: string } {
        const fileExtension = file.originalname.split('.').pop()?.toLowerCase() || '';

        if (!AUDIO_CONFIG.VALID_EXTENSIONS.includes(fileExtension as any)) {
            return {
                valid: false,
                error: `Formato de áudio não suportado. Formatos válidos: ${AUDIO_CONFIG.VALID_EXTENSIONS.join(', ')}`
            };
        }

        if (file.size > AUDIO_CONFIG.MAX_SIZE) {
            return {
                valid: false,
                error: `Arquivo muito grande. Tamanho máximo: 25MB. Seu arquivo: ${(file.size / 1024 / 1024).toFixed(2)}MB`
            };
        }

        return { valid: true };
    }

    private async transcribeAudio(file: Express.Multer.File): Promise<string> {

        const transcription = await openai.audio.transcriptions.create({
            file: new File([file.buffer as any], file.originalname, { type: file.mimetype }),
            model: AUDIO_CONFIG.MODEL,
            prompt: 'Construction work report: transcribe all technical terms, measurements, quantities, materials, equipment, locations, names, dates, and details. Add proper punctuation.'
        });

        return transcription.text;
    }

    private async enhanceText(text: string): Promise<{ enhanced: string; tokensUsed: number }> {
        const completion = await openai.chat.completions.create({
            model: GPT_CONFIG.MODEL,
            temperature: GPT_CONFIG.TEMPERATURE,
            max_tokens: GPT_CONFIG.MAX_TOKENS,
            messages: [
                { role: 'system', content: OpenIaPrompt.reportPrompt() },
                { role: 'user', content: text }
            ]
        });

        const enhanced = completion.choices[0]?.message?.content || text;
        const tokensUsed = completion.usage?.total_tokens || 0;

        return { enhanced, tokensUsed };
    }

    async transcribe(request: Request, response: Response): Promise<Response> {
        const uploadSingle = upload.single('audio');

        return new Promise((resolve) => {
            uploadSingle(request, response, async (err: any) => {
                if (err) {
                    return resolve(response.status(400).json({
                        error: 'Erro ao fazer upload do áudio',
                        details: err.message
                    }));
                }

                try {
                    const file = request.file;

                    if (!file) {
                        return resolve(response.status(400).json({
                            error: 'Nenhum arquivo de áudio fornecido'
                        }));
                    }

                    const validation = this.validateAudioFile(file);
                    if (!validation.valid) {
                        return resolve(response.status(400).json({
                            error: validation.error
                        }));
                    }

                    const text = await this.transcribeAudio(file);

                    return resolve(response.status(200).json({
                        success: true,
                        data: {
                            text,
                            language: AUDIO_CONFIG.LANGUAGE,
                            model: AUDIO_CONFIG.MODEL
                        }
                    }));

                } catch (error: any) {
                    console.error('❌ Erro ao transcrever áudio:', error);

                    return resolve(response.status(500).json({
                        error: 'Erro ao transcrever áudio',
                        message: error.message || 'Erro desconhecido'
                    }));
                }
            });
        });
    }

    async enhanceDescription(request: Request, response: Response): Promise<Response> {
        try {
            const { text } = request.body;

            if (!text || typeof text !== 'string') {
                return response.status(400).json({
                    error: 'Campo "text" é obrigatório e deve ser uma string'
                });
            }

            if (text.trim().length === 0) {
                return response.status(400).json({
                    error: 'Texto não pode estar vazio'
                });
            }

            if (text.length > GPT_CONFIG.MAX_TEXT_LENGTH) {
                return response.status(400).json({
                    error: `Texto muito longo. Máximo: ${GPT_CONFIG.MAX_TEXT_LENGTH} caracteres`,
                    currentLength: text.length
                });
            }

            const { enhanced, tokensUsed } = await this.enhanceText(text);

            return response.status(200).json({
                success: true,
                data: {
                    original: text,
                    enhanced,
                    model: GPT_CONFIG.MODEL,
                    tokensUsed
                }
            });

        } catch (error: any) {
            console.error('❌ Erro ao melhorar descrição:', error);

            return response.status(500).json({
                error: 'Erro ao melhorar descrição',
                message: error.message || 'Erro desconhecido'
            });
        }
    }

    async transcribeAndEnhance(request: Request, response: Response): Promise<Response> {
        const uploadSingle = upload.single('audio');

        return new Promise((resolve) => {
            uploadSingle(request, response, async (err: any) => {
                if (err) {
                    return resolve(response.status(400).json({
                        error: 'Erro ao fazer upload do áudio',
                        details: err.message
                    }));
                }

                try {
                    const file = request.file;

                    if (!file) {
                        return resolve(response.status(400).json({
                            error: 'Nenhum arquivo de áudio fornecido'
                        }));
                    }

                    const validation = this.validateAudioFile(file);
                    if (!validation.valid) {
                        return resolve(response.status(400).json({
                            error: validation.error
                        }));
                    }

                    const transcribed = await this.transcribeAudio(file);

                    const { enhanced, tokensUsed } = await this.enhanceText(transcribed);

                    return resolve(response.status(200).json({
                        success: true,
                        data: {
                            transcribed,
                            enhanced,
                            models: {
                                transcription: AUDIO_CONFIG.MODEL,
                                enhancement: GPT_CONFIG.MODEL
                            },
                            tokensUsed
                        }
                    }));

                } catch (error: any) {
                    console.error('❌ Erro ao processar áudio:', error);

                    return resolve(response.status(500).json({
                        error: 'Erro ao processar áudio',
                        message: error.message || 'Erro desconhecido'
                    }));
                }
            });
        });
    }

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


        if (categoryName !== undefined && !categoryName) {
            return res.status(400).json({
                error: "Category name cannot be empty when provided"
            });
        }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4.1-nano",
                messages: [{
                    role: "user",
                    content: OpenIaPrompt.switch(
                        categoryName ? "generateDescriptionCategory" : "generateDescription",
                        serviceName,
                        description,
                        undefined,
                        undefined,
                        categoryName
                    )
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
                error: "Internal server error",
                message: error instanceof Error ? error.message : 'Erro desconhecido'
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

        if (categoryName !== undefined && !categoryName) {
            return res.status(400).json({
                error: "Category name cannot be empty when provided"
            });
        }

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4.1-nano",
                messages: [{
                    role: "user",
                    content: OpenIaPrompt.switch(
                        categoryName ? "incrementDescriptionCategory" : "incrementDescription",
                        serviceName,
                        description,
                        quantity,
                        price,
                        categoryName
                    )
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

    async transcribeAudio2(req: Request, res: Response) {
        const file = req.file

        if (!file) {
            return res.status(400).json({
                error: "Audio blob, model and response format are required"
            });
        }

        try {
            const response = await openai.audio.transcriptions.create({
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
            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
}
