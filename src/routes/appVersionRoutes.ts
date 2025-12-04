import { Router } from 'express';
import { AppVersionController } from '../controllers/appVersion/AppVersionController';
import { checkToken } from '../middlewares/checkToken';

const appVersionRoutes = Router();
const appVersionController = new AppVersionController();

// Rota pública (sem autenticação) - para o app verificar versão
appVersionRoutes.get('/app/version', appVersionController.getVersion.bind(appVersionController));

// Rotas protegidas (requer autenticação) - para o master gerenciar
appVersionRoutes.get('/app/version/admin', checkToken, appVersionController.getVersionAdmin.bind(appVersionController));
appVersionRoutes.put('/app/version/admin', checkToken, appVersionController.updateVersion.bind(appVersionController));

export { appVersionRoutes };

