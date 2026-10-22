import { Router } from "express";
import { checkToken } from "../middlewares/checkToken";
import { HelpAssistantController } from "../helpAssistant/HelpAssistantController";

const helpAssistantRoutes = Router();
const controller = new HelpAssistantController();

helpAssistantRoutes.post("/help-assistant/chat", checkToken, controller.chat.bind(controller));
helpAssistantRoutes.get("/help-assistant/threads", checkToken, controller.listThreads.bind(controller));
helpAssistantRoutes.get("/help-assistant/threads/:threadId", checkToken, controller.getThread.bind(controller));
helpAssistantRoutes.delete("/help-assistant/threads/:threadId", checkToken, controller.deleteThread.bind(controller));

export { helpAssistantRoutes };
