import { Request, Response } from 'express';
import OpenAI from 'openai';
import { upload } from '../../config/upload';

// Inicializa cliente OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_KEY || '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'
});

export class OpenAIController {
    /**
     * 🎤 Transcreve áudio usando Whisper
     * POST /ai/transcribe
     * 
     * @param request - Multipart form-data com campo 'audio' (arquivo de áudio)
     * @param response - JSON com texto transcrito
     */
    async transcribe(request: Request, response: Response) {
        const uploadSingle = upload.single('audio');

        uploadSingle(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ 
                    error: 'Erro ao fazer upload do áudio',
                    details: err.message 
                });
            }

            try {
                const file = request.file;

                if (!file) {
                    return response.status(400).json({ 
                        error: 'Nenhum arquivo de áudio fornecido' 
                    });
                }

                // Valida formato do arquivo
                const allowedFormats = ['audio/mp3', 'audio/mp4', 'audio/mpeg', 'audio/mpga', 'audio/m4a', 'audio/wav', 'audio/webm'];
                const fileExtension = file.originalname.split('.').pop()?.toLowerCase();
                const validExtensions = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];

                if (!validExtensions.includes(fileExtension || '')) {
                    return response.status(400).json({ 
                        error: 'Formato de áudio não suportado',
                        supportedFormats: validExtensions
                    });
                }

                // Valida tamanho (máximo 25MB)
                const maxSize = 25 * 1024 * 1024; // 25MB em bytes
                if (file.size > maxSize) {
                    return response.status(400).json({ 
                        error: 'Arquivo muito grande',
                        maxSize: '25MB',
                        fileSize: `${(file.size / 1024 / 1024).toFixed(2)}MB`
                    });
                }

                console.log('🎤 Transcrevendo áudio:', {
                    originalName: file.originalname,
                    size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
                    mimetype: file.mimetype
                });

                // Transcreve usando Whisper (modelo gpt-4o-mini-transcribe para melhor qualidade)
                const transcription = await openai.audio.transcriptions.create({
                    file: file.buffer as any, // O buffer do arquivo
                    model: 'gpt-4o-mini-transcribe',
                    response_format: 'text',
                    language: 'pt', // Português
                    prompt: 'O áudio contém uma descrição de trabalho em construção civil. Inclua pontuação adequada.'
                });

                const transcribedText = typeof transcription === 'string' 
                    ? transcription 
                    : transcription.text;

                console.log('✅ Transcrição concluída:', {
                    textLength: transcribedText.length,
                    preview: transcribedText.substring(0, 100)
                });

                return response.status(200).json({
                    success: true,
                    data: {
                        text: transcribedText,
                        language: 'pt',
                        duration: null, // Whisper não retorna duração
                        model: 'gpt-4o-mini-transcribe'
                    }
                });

            } catch (error: any) {
                console.error('❌ Erro ao transcrever áudio:', error);
                
                return response.status(500).json({
                    error: 'Erro ao transcrever áudio',
                    message: error.message || 'Erro desconhecido',
                    details: error.response?.data || null
                });
            }
        });
    }

    /**
     * ✨ Melhora descrição usando GPT
     * POST /ai/enhance-description
     * 
     * @param request - Body: { text: string }
     * @param response - JSON com texto melhorado
     */
    async enhanceDescription(request: Request, response: Response) {
        try {
            const { text } = request.body;

            // Validações
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

            if (text.length > 5000) {
                return response.status(400).json({ 
                    error: 'Texto muito longo (máximo 5000 caracteres)',
                    currentLength: text.length
                });
            }

            console.log('✨ Melhorando descrição:', {
                originalLength: text.length,
                preview: text.substring(0, 100)
            });

            // Prompt otimizado para descrições de construção civil
            const systemPrompt = `Você é um assistente especializado em construção civil e gestão de obras.

Sua tarefa é melhorar descrições de trabalho mantendo:
- Linguagem profissional e clara
- Informações técnicas precisas
- Formatação adequada com pontuação correta
- Tom objetivo e conciso

REGRAS:
1. Corrija erros de ortografia e gramática
2. Melhore a estrutura das frases
3. Adicione pontuação adequada
4. Mantenha todos os detalhes técnicos mencionados
5. NÃO invente informações que não estão no texto original
6. NÃO remova informações importantes
7. Se o texto mencionar quantidades, materiais ou locais, preserve essas informações
8. Mantenha o texto conciso (máximo 3-4 frases)

Retorne APENAS o texto melhorado, sem explicações adicionais.`;

            const completion = await openai.chat.completions.create({
                model: 'gpt-4.1-nano',
                temperature: 0.3, // Baixa temperatura para respostas mais consistentes
                max_tokens: 500,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: text
                    }
                ]
            });

            const enhancedText = completion.choices[0]?.message?.content || text;

            console.log('✅ Descrição melhorada:', {
                originalLength: text.length,
                enhancedLength: enhancedText.length,
                tokensUsed: completion.usage?.total_tokens
            });

            return response.status(200).json({
                success: true,
                data: {
                    original: text,
                    enhanced: enhancedText,
                    model: 'gpt-4.1-nano',
                    tokensUsed: completion.usage?.total_tokens || 0
                }
            });

        } catch (error: any) {
            console.error('❌ Erro ao melhorar descrição:', error);
            
            return response.status(500).json({
                error: 'Erro ao melhorar descrição',
                message: error.message || 'Erro desconhecido',
                details: error.response?.data || null
            });
        }
    }

    /**
     * 🎤✨ Transcreve E melhora em uma única chamada (mais eficiente)
     * POST /ai/transcribe-and-enhance
     * 
     * @param request - Multipart form-data com campo 'audio'
     * @param response - JSON com texto transcrito E melhorado
     */
    async transcribeAndEnhance(request: Request, response: Response) {
        const uploadSingle = upload.single('audio');

        uploadSingle(request, response, async (err) => {
            if (err) {
                return response.status(400).json({ 
                    error: 'Erro ao fazer upload do áudio',
                    details: err.message 
                });
            }

            try {
                const file = request.file;

                if (!file) {
                    return response.status(400).json({ 
                        error: 'Nenhum arquivo de áudio fornecido' 
                    });
                }

                console.log('🎤✨ Transcrevendo e melhorando áudio...');

                // Passo 1: Transcrever
                const transcription = await openai.audio.transcriptions.create({
                    file: file.buffer as any,
                    model: 'gpt-4o-mini-transcribe',
                    response_format: 'text',
                    language: 'pt',
                    prompt: 'O áudio contém uma descrição de trabalho em construção civil.'
                });

                const transcribedText = typeof transcription === 'string' 
                    ? transcription 
                    : transcription.text;

                console.log('✅ Transcrição concluída');

                // Passo 2: Melhorar
                const systemPrompt = `Você é um assistente especializado em construção civil e gestão de obras.

Melhore a descrição mantendo linguagem profissional, corrigindo erros, e preservando todos os detalhes técnicos.
Retorne APENAS o texto melhorado, sem explicações.`;

                const completion = await openai.chat.completions.create({
                    model: 'gpt-4.1-nano',
                    temperature: 0.3,
                    max_tokens: 500,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: transcribedText
                        }
                    ]
                });

                const enhancedText = completion.choices[0]?.message?.content || transcribedText;

                console.log('✅ Descrição melhorada');

                return response.status(200).json({
                    success: true,
                    data: {
                        transcribed: transcribedText,
                        enhanced: enhancedText,
                        models: {
                            transcription: 'gpt-4o-mini-transcribe',
                            enhancement: 'gpt-4.1-nano'
                        },
                        tokensUsed: completion.usage?.total_tokens || 0
                    }
                });

            } catch (error: any) {
                console.error('❌ Erro ao processar áudio:', error);
                
                return response.status(500).json({
                    error: 'Erro ao processar áudio',
                    message: error.message || 'Erro desconhecido',
                    details: error.response?.data || null
                });
            }
        });
    }
}

