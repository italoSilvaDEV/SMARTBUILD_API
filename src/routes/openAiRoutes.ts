import { Router } from 'express';
import { OpenAIController } from '../controllers/OpenAI/OpenAIController';
import { checkToken } from '../middlewares/checkToken';
import upload from '../config/upload';
import multer from 'multer';

const openAIController = new OpenAIController();
const openAiRoutes = Router();
const audioUpload = multer(upload.upload("./public/tmp/audio"))

openAiRoutes.post('/ai/transcribe', checkToken, openAIController.transcribe.bind(openAIController));
openAiRoutes.post('/ai/enhance-description', checkToken, openAIController.enhanceDescription.bind(openAIController));
openAiRoutes.post('/ai/transcribe-and-enhance', checkToken, openAIController.transcribeAndEnhance.bind(openAIController));
openAiRoutes.post("/transcription", checkToken, audioUpload.single("file"), openAIController.transcribeAudio2.bind(openAIController));
openAiRoutes.post("/description/generate", checkToken, openAIController.generateDescription.bind(openAIController));
openAiRoutes.post("/description/increment", checkToken, openAIController.incrementDescription.bind(openAIController));

export { openAiRoutes };
