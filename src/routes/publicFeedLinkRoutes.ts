import { Router } from 'express';
import { PublicFeedLinkController } from '../controllers/projects/PublicFeedLinkController';
import { checkToken } from '../middlewares/checkToken';

const publicFeedLinkController = new PublicFeedLinkController();
const publicFeedLinkRoutes = Router();

// ==================== ADMIN/AUTHENTICATED ROUTES ====================

// Criar link público para um projeto (requer autenticação)
publicFeedLinkRoutes.post(
    '/projects/:projectId/public-link',
    checkToken,
    publicFeedLinkController.createPublicLink.bind(publicFeedLinkController)
);

// Listar links públicos de um projeto (requer autenticação)
publicFeedLinkRoutes.get(
    '/projects/:projectId/public-links',
    checkToken,
    publicFeedLinkController.getProjectPublicLinks.bind(publicFeedLinkController)
);

// Desativar link público (requer autenticação)
publicFeedLinkRoutes.delete(
    '/public-links/:linkId',
    checkToken,
    publicFeedLinkController.deactivatePublicLink.bind(publicFeedLinkController)
);

// Reativar link público (requer autenticação)
publicFeedLinkRoutes.patch(
    '/public-links/:linkId/activate',
    checkToken,
    publicFeedLinkController.activatePublicLink.bind(publicFeedLinkController)
);

// ==================== MULTI-PROJECT ROUTES ====================

// Criar link público para múltiplos projetos (requer autenticação)
publicFeedLinkRoutes.post(
    '/feed/public-link/multi-project',
    checkToken,
    publicFeedLinkController.createMultiProjectLink.bind(publicFeedLinkController)
);

// ==================== PUBLIC ROUTES (NO AUTH) ====================

// Acessar feed via link público (SEM autenticação)
publicFeedLinkRoutes.get(
    '/public/feed/:token',
    publicFeedLinkController.getPublicFeed.bind(publicFeedLinkController)
);

// Acessar feed multi-projeto via link público (SEM autenticação)
publicFeedLinkRoutes.get(
    '/public/feed/multi/:token',
    publicFeedLinkController.getMultiProjectFeed.bind(publicFeedLinkController)
);

export { publicFeedLinkRoutes };

