import { Router } from "express";
import { ChatController } from "../controllers/tasks/ChatController";
import { checkToken } from "../middlewares/checkToken";
import multer from "multer";
import uploadConfig from "../config/upload";

const chatRoutes = Router();
const chatController = new ChatController();
const upload = multer(uploadConfig.upload("./public/tmp/chat-files"));

// Listar conversas do usuário
chatRoutes.get("/user/:userId", checkToken, (req, res) => chatController.listChats(req, res));

// Criar ou buscar chat 1:1
chatRoutes.post("/private", checkToken, (req, res) => chatController.getOrCreatePrivateChat(req, res));

// Criar grupo (com suporte a foto)
chatRoutes.post("/group", checkToken, upload.single("file"), (req, res) => chatController.createGroup(req, res));

// Atualizar grupo
chatRoutes.put("/group/:chatId", checkToken, upload.single("file"), (req, res) => chatController.updateGroup(req, res));

// Listar usuários da empresa para o chat
chatRoutes.get("/company/:companyId/users", checkToken, (req, res) => chatController.listCompanyUsers(req, res));

// Enviar mensagem (com suporte a arquivo)
chatRoutes.post("/:chatId/messages", checkToken, upload.single("file"), (req, res) => chatController.sendMessage(req, res));

// Listar mensagens de um chat
chatRoutes.get("/:chatId/messages", checkToken, (req, res) => chatController.listMessages(req, res));

// Arquivar/desarquivar conversa para o usuário
chatRoutes.patch("/:chatId/archive", checkToken, (req, res) => chatController.archiveChat(req, res));
chatRoutes.patch("/:chatId/unarchive", checkToken, (req, res) => chatController.unarchiveChat(req, res));

// Apagar mensagem (soft-delete com placeholder)
chatRoutes.delete("/:chatId/messages/:messageId", checkToken, (req, res) => chatController.deleteMessage(req, res));

export { chatRoutes };
