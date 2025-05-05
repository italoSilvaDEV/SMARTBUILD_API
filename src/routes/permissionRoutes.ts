import { Router } from 'express';
import { PermissionController } from '../controllers/permissions/PermissionController';
import { checkToken } from '../middlewares/checkToken';

const permissionRoutes = Router();
const permissionController = new PermissionController();

// Rotas para permissões
permissionRoutes.post('/permissions', checkToken, permissionController.create);
permissionRoutes.get('/permissions', permissionController.getAllPermissions);
permissionRoutes.get('/permissions/:id', permissionController.getPermissionById);
permissionRoutes.put('/permissions/:id', checkToken, permissionController.updatePermission);
permissionRoutes.delete('/permissions/:id', checkToken, permissionController.deletePermission);

export { permissionRoutes }; 