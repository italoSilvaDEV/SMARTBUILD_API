import { Router } from 'express';
import { PermissionController } from '../controllers/permissions/PermissionController';
import { checkToken } from '../middlewares/checkToken';
import { requireMaster } from '../middlewares/requireMaster';

const permissionRoutes = Router();
const permissionController = new PermissionController();

// Rotas para permissões
permissionRoutes.post('/permissions', checkToken, requireMaster, permissionController.create);
permissionRoutes.get('/permissions', permissionController.getAllPermissions);
permissionRoutes.get('/permissions/:id', permissionController.getPermissionById);
permissionRoutes.put('/permissions/:id', checkToken, requireMaster, permissionController.updatePermission);
permissionRoutes.delete('/permissions/:id', checkToken, requireMaster, permissionController.deletePermission);

export { permissionRoutes }; 