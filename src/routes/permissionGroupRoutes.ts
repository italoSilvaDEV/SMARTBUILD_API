import { Router } from 'express';
import { PermissionGroupController } from '../adapters/controllers/permissionGroupController';
import { PermissionGroupService } from '../application/services/permissionGroupService';
import { PrismaPermissionGroupRepository } from '../infrastructure/repositories/prisma/PrismaPermissionGroupRepository';
import { PrismaPermissionRepository } from '../infrastructure/repositories/prisma/PrismaPermissionRepository';
import { checkToken } from '../middlewares/checkToken';

const permissionGroupRoutes = Router();
const permissionGroupRepository = new PrismaPermissionGroupRepository();
const permissionRepository = new PrismaPermissionRepository();
const permissionGroupService = new PermissionGroupService(permissionGroupRepository, permissionRepository);
const permissionGroupController = new PermissionGroupController(permissionGroupService);

// Rotas para grupos de permissões
permissionGroupRoutes.post('/permission-groups', checkToken, (req, res) => permissionGroupController.createPermissionGroup(req, res));
permissionGroupRoutes.get('/permission-groups', checkToken, (req, res) => permissionGroupController.getAllPermissionGroups(req, res));
permissionGroupRoutes.get('/permission-groups/:id', checkToken, (req, res) => permissionGroupController.getPermissionGroupById(req, res));
permissionGroupRoutes.put('/permission-groups/:id', checkToken, (req, res) => permissionGroupController.updatePermissionGroup(req, res));
permissionGroupRoutes.delete('/permission-groups/:id', checkToken, (req, res) => permissionGroupController.deletePermissionGroup(req, res));
permissionGroupRoutes.post('/permission-groups/:id/permissions', checkToken, (req, res) => permissionGroupController.addPermissionsToGroup(req, res));
permissionGroupRoutes.delete('/permission-groups/:id/permissions', checkToken, (req, res) => permissionGroupController.removePermissionsFromGroup(req, res));

export { permissionGroupRoutes }; 