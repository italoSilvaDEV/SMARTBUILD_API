import { Router } from 'express';
import { ProjectFeedController } from '../controllers/projects/ProjectFeedController';
import { checkToken } from '../middlewares/checkToken';

const projectFeedController = new ProjectFeedController();
const projectFeedRoutes = Router();

// Criar post no feed (texto + fotos)
// Aceita tanto projectId quanto serviceProjectId
projectFeedRoutes.post(
    '/projects/:id/feed',
    checkToken,
    projectFeedController.createPost.bind(projectFeedController)
);

// Listar feed do projeto
projectFeedRoutes.get(
    '/projects/:projectId/feed',
    checkToken,
    projectFeedController.getFeed.bind(projectFeedController)
);

// Editar post do feed
projectFeedRoutes.put(
    '/feed/:postId',
    checkToken,
    projectFeedController.editPost.bind(projectFeedController)
);

// Deletar post do feed
projectFeedRoutes.delete(
    '/feed/:postId',
    checkToken,
    projectFeedController.deletePost.bind(projectFeedController)
);

// Deletar foto individual
projectFeedRoutes.delete(
    '/feed/photos/:photoId',
    checkToken,
    projectFeedController.deletePhoto.bind(projectFeedController)
);

// Buscar feed de um serviço específico
projectFeedRoutes.get(
    '/services/:serviceProjectId/feed',
    checkToken,
    projectFeedController.getServiceFeed.bind(projectFeedController)
);

// Buscar feed de um funcionário específico (todos os projetos)
projectFeedRoutes.get(
    '/users/:userId/feed',
    checkToken,
    projectFeedController.getUserFeed.bind(projectFeedController)
);

// ==================== COMENTÁRIOS ====================

// Criar comentário em um post
projectFeedRoutes.post(
    '/feed/:postId/comments',
    checkToken,
    projectFeedController.createComment.bind(projectFeedController)
);

// Listar comentários de um post
projectFeedRoutes.get(
    '/feed/:postId/comments',
    checkToken,
    projectFeedController.getComments.bind(projectFeedController)
);

// Deletar comentário
projectFeedRoutes.delete(
    '/feed/comments/:commentId',
    checkToken,
    projectFeedController.deleteComment.bind(projectFeedController)
);

// ==================== LIKES ====================

// Dar like em um post
projectFeedRoutes.post(
    '/feed/:postId/like',
    checkToken,
    projectFeedController.likePost.bind(projectFeedController)
);

// Remover like de um post
projectFeedRoutes.delete(
    '/feed/:postId/like',
    checkToken,
    projectFeedController.unlikePost.bind(projectFeedController)
);

// Listar likes de um post
projectFeedRoutes.get(
    '/feed/:postId/likes',
    checkToken,
    projectFeedController.getLikes.bind(projectFeedController)
);

// ==================== NOTIFICAÇÕES ====================

// Listar notificações de um usuário
projectFeedRoutes.get(
    '/users/:userId/notifications',
    checkToken,
    projectFeedController.getNotifications.bind(projectFeedController)
);

// Marcar notificação como lida
projectFeedRoutes.patch(
    '/notifications/:notificationId/read',
    checkToken,
    projectFeedController.markNotificationAsRead.bind(projectFeedController)
);

// Marcar todas notificações como lidas
projectFeedRoutes.patch(
    '/users/:userId/notifications/read-all',
    checkToken,
    projectFeedController.markAllNotificationsAsRead.bind(projectFeedController)
);

export { projectFeedRoutes };

