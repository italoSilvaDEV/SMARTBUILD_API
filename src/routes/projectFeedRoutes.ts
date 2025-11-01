import { Router } from "express";
import { ProjectFeedController } from "../controllers/projects/ProjectFeedController";
import { ProjectQRCodeController } from "../controllers/projects/ProjectQRCodeController";
import { ProjectFeedShareController } from "../controllers/projects/ProjectFeedShareController";
import { checkToken } from "../middlewares/checkToken";

const routes = Router();

const projectFeedController = new ProjectFeedController();
const projectQRCodeController = new ProjectQRCodeController();
const projectFeedShareController = new ProjectFeedShareController();

// ===== PROJECT FEED ROUTES =====

// Criar post no feed (com upload de mídia)
routes.post("/projects/:projectId/feed", checkToken, projectFeedController.create);

// Listar feed de um projeto
routes.get("/projects/:projectId/feed", checkToken, projectFeedController.list);

// Obter estatísticas do feed
routes.get("/projects/:projectId/feed/stats", checkToken, projectFeedController.getStats);

// Buscar post específico
routes.get("/projects/feed/:feedId", checkToken, projectFeedController.show);

// Atualizar post
routes.put("/projects/feed/:feedId", checkToken, projectFeedController.update);

// Deletar post
routes.delete("/projects/feed/:feedId", checkToken, projectFeedController.delete);

// ===== COMMENTS =====

// Adicionar comentário
routes.post("/projects/feed/:feedId/comments", checkToken, projectFeedController.addComment);

// Deletar comentário
routes.delete("/projects/feed/comments/:commentId", checkToken, projectFeedController.deleteComment);

// ===== REACTIONS =====

// Toggle reação (adicionar/remover)
routes.post("/projects/feed/:feedId/reactions", checkToken, projectFeedController.toggleReaction);

// ===== QR CODE ROUTES =====

// Gerar ou obter QR Code de um projeto
routes.post("/projects/:projectId/qrcode", checkToken, projectQRCodeController.generateOrGet);

// Validar e acessar projeto via QR Code (sem autenticação para mobile)
routes.get("/projects/qrcode/:code", projectQRCodeController.validateAndAccess);

// Desativar QR Code
routes.put("/projects/qrcode/:code/deactivate", checkToken, projectQRCodeController.deactivate);

// Ativar QR Code
routes.put("/projects/qrcode/:code/activate", checkToken, projectQRCodeController.activate);

// Regenerar QR Code
routes.post("/projects/:projectId/qrcode/regenerate", checkToken, projectQRCodeController.regenerate);

// Estatísticas do QR Code
routes.get("/projects/:projectId/qrcode/stats", checkToken, projectQRCodeController.getStats);

// Dados para impressão do QR Code
routes.get("/projects/:projectId/qrcode/print", checkToken, projectQRCodeController.getPrintData);

// ===== SHARE ROUTES =====

// Criar link de compartilhamento
routes.post("/projects/:projectId/feed/share", checkToken, projectFeedShareController.create);

// Listar compartilhamentos de um projeto
routes.get("/projects/:projectId/feed/shares", checkToken, projectFeedShareController.list);

// Acessar feed compartilhado (público - sem autenticação)
routes.post("/projects/feed/shared/:token", projectFeedShareController.access);

// Atualizar compartilhamento
routes.put("/projects/feed/share/:shareId", checkToken, projectFeedShareController.update);

// Deletar compartilhamento
routes.delete("/projects/feed/share/:shareId", checkToken, projectFeedShareController.delete);

// Estatísticas de compartilhamento
routes.get("/projects/feed/share/:shareId/stats", checkToken, projectFeedShareController.getStats);

export { routes as projectFeedRoutes };

