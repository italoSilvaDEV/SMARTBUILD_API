import { Router } from "express";
import { ChatController } from "../controllers/tasks/ChatController";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";

const chatRoutes = Router();
const chatController = new ChatController();
const upload = multer(uploadConfig.upload("./public/tmp/chat-files"));

// Listar conversas do usuário
chatRoutes.get("/user/:userId", checkToken, chatController.listChats);

// Criar ou buscar chat 1:1
chatRoutes.post("/private", checkToken, chatController.getOrCreatePrivateChat);

// Criar grupo (com suporte a foto)
chatRoutes.post("/group", checkToken, upload.single("file"), chatController.createGroup);

// Atualizar grupo
chatRoutes.put("/group/:chatId", checkToken, upload.single("file"), chatController.updateGroup);

// Listar usuários da empresa para o chat
chatRoutes.get("/company/:companyId/users", checkToken, chatController.listCompanyUsers);

// Enviar mensagem (com suporte a arquivo)
chatRoutes.post("/:chatId/messages", checkToken, upload.single("file"), chatController.sendMessage);

// Listar mensagens de um chat
chatRoutes.get("/:chatId/messages", checkToken, chatController.listMessages);

export { chatRoutes };
