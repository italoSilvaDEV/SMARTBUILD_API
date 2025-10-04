import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { OpenIAController } from "../controllers/OpenIA/OpenIAController";
import upload from "../config/upload";
import multer from "multer";

const openAiRoutes = Router();
const openAiController = new OpenIAController();

const audioUpload = multer(upload.upload("./public/tmp/audio"))

openAiRoutes.post("/openai/transcribe", checkToken, audioUpload.single("file"), openAiController.transcribeAudio);
openAiRoutes.post("/openai/description/generate", checkToken, openAiController.generateDescription);
openAiRoutes.post("/openai/description/increment", checkToken, openAiController.incrementDescription);

export { openAiRoutes }; 