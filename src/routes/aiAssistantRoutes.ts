import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { AIAssistantController } from "../controllers/aiAssistant/AIAssistantController";

const aiAssistantRoutes = Router();
const controller = new AIAssistantController();

aiAssistantRoutes.get("/ai-assistant/threads", checkToken, controller.listThreads.bind(controller));
aiAssistantRoutes.post("/ai-assistant/threads", checkToken, controller.createThread.bind(controller));
aiAssistantRoutes.get("/ai-assistant/threads/:threadId", checkToken, controller.getThread.bind(controller));
aiAssistantRoutes.post("/ai-assistant/threads/:threadId/messages", checkToken, controller.sendMessage.bind(controller));

export { aiAssistantRoutes };

