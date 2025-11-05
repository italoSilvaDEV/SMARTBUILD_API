import { Router } from 'express';
import { OpenAIController } from '../controllers/OpenAI/OpenAIController';
import { checkToken } from '../middlewares/checkToken';

const openAIController = new OpenAIController();
const openAiRoutes = Router();

// 🎤 Transcrever áudio (Whisper)
openAiRoutes.post('/ai/transcribe', checkToken, openAIController.transcribe.bind(openAIController));

// ✨ Melhorar descrição (GPT)
openAiRoutes.post('/ai/enhance-description', checkToken, openAIController.enhanceDescription.bind(openAIController));

// 🎤✨ Transcrever E melhorar em uma única chamada (recomendado)
openAiRoutes.post('/ai/transcribe-and-enhance', checkToken, openAIController.transcribeAndEnhance.bind(openAIController));

export { openAiRoutes };
