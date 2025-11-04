import { Router } from 'express';
import { ProjectFeedController } from '../controllers/projects/ProjectFeedController';
import { checkToken } from '../middlewares/checkToken';

const projectFeedController = new ProjectFeedController();
const projectFeedRoutes = Router();

// Criar post no feed (texto + fotos)
projectFeedRoutes.post(
    '/projects/:projectId/feed',
    checkToken,
    projectFeedController.createPost.bind(projectFeedController)
);

// Listar feed do projeto
projectFeedRoutes.get(
    '/projects/:projectId/feed',
    checkToken,
    projectFeedController.getFeed.bind(projectFeedController)
);

// Deletar post do feed
projectFeedRoutes.delete(
    '/feed/:postId',
    checkToken,
    projectFeedController.deletePost.bind(projectFeedController)
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

export { projectFeedRoutes };

