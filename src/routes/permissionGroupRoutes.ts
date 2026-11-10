import { Router } from 'express';
import { PermissionGroupController } from '../controllers/permissions/PermissionGroupController';
import { checkToken } from '../middlewares/checkToken';
import { requireMaster } from '../middlewares/requireMaster';

const permissionGroupRoutes = Router();
const permissionGroupController = new PermissionGroupController();

// Rotas básicas para grupos de permissão
permissionGroupRoutes.post('/permission-groups', checkToken, requireMaster, permissionGroupController.create);
permissionGroupRoutes.get('/permission-groups', permissionGroupController.getAllPermissionGroups);
permissionGroupRoutes.get('/permission-groups/:id', permissionGroupController.getGroupById);
permissionGroupRoutes.put('/permission-groups/:id', checkToken, requireMaster, permissionGroupController.updateGroup);
permissionGroupRoutes.delete('/permission-groups/:id', checkToken, requireMaster, permissionGroupController.deleteGroup);

// Rotas para gerenciar permissões dentro de um grupo
permissionGroupRoutes.post('/permission-groups/:id/permissions', checkToken, requireMaster, permissionGroupController.addPermissionsToGroup);
permissionGroupRoutes.delete('/permission-groups/:id/permissions', checkToken, requireMaster, permissionGroupController.removePermissionsFromGroup);

export { permissionGroupRoutes }; 