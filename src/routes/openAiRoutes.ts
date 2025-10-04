import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { OpenIAController } from "../controllers/OpenIA/OpenIAController";
import upload from "../config/upload";
import multer from "multer";

const openAiRoutes = Router();
const openAiController = new OpenIAController();

const audioUpload = multer(upload.upload("./public/tmp/audio"))

openAiRoutes.post("/transcribe", checkToken, audioUpload.single("file"), openAiController.transcribeAudio);
openAiRoutes.post("/description/generate", checkToken, openAiController.generateDescription);
openAiRoutes.post("/description/increment", checkToken, openAiController.incrementDescription);

export { openAiRoutes }; 