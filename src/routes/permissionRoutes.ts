import { Router } from 'express';
import { PermissionController } from '../adapters/controllers/permissionController';
import { PermissionService } from '../application/services/permissionService';
import { PrismaPermissionRepository } from '../infrastructure/repositories/prisma/PrismaPermissionRepository';
import { checkToken } from '../middlewares/checkToken';

const permissionRoutes = Router();
const permissionRepository = new PrismaPermissionRepository();
const permissionService = new PermissionService(permissionRepository);
const permissionController = new PermissionController(permissionService);

// Rotas para permissões
permissionRoutes.post('/permissions', checkToken, (req, res) => permissionController.createPermission(req, res));
permissionRoutes.get('/permissions', checkToken, (req, res) => permissionController.getAllPermissions(req, res));
permissionRoutes.get('/permissions/:id', checkToken, (req, res) => permissionController.getPermissionById(req, res));
permissionRoutes.put('/permissions/:id', checkToken, (req, res) => permissionController.updatePermission(req, res));
permissionRoutes.delete('/permissions/:id', checkToken, (req, res) => permissionController.deletePermission(req, res));

export { permissionRoutes }; 