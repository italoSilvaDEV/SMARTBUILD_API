import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class PermissionController {
  async create(req: Request, res: Response) {
    try {
      const { description } = req.body;

      if (!description) {
        return res.status(400).json({ message: 'Description is required' });
      }

      // Verificar se já existe uma permissão com essa descrição
      const existingPermission = await prisma.permissions.findFirst({
        where: { description }
      });

      if (existingPermission) {
        return res.status(400).json({ message: 'Permission with this description already exists' });
      }

      const permission = await prisma.permissions.create({
        data: { description }
      });

      // Formatar resposta para compatibilidade com PrismaPermissionRepository
      const formattedPermission = {
        id: permission.id,
        description: permission.description,
        date_creation: permission.date_creation,
        date_update: permission.date_update
      };

      res.status(201).json(formattedPermission);
    } catch (error) {
      res.status(500).json({ message: 'Error creating permission', error: (error as Error).message });
    }
  }

  async getAllPermissions(req: Request, res: Response) {
    try {
      const permissions = await prisma.permissions.findMany({
        orderBy: { description: 'asc' }
      });
      
      // Formatar resultados para compatibilidade com PrismaPermissionRepository
      const formattedPermissions = permissions.map(permission => ({
        id: permission.id,
        description: permission.description,
        date_creation: permission.date_creation,
        date_update: permission.date_update
      }));
      
      res.status(200).json(formattedPermissions);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching permissions', error: (error as Error).message });
    }
  }

  async getPermissionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const permission = await prisma.permissions.findUnique({
        where: { id }
      });
      
      if (!permission) {
        res.status(404).json({ message: 'Permission not found' });
        return;
      }
      
      // Formatar resultado para compatibilidade com PrismaPermissionRepository
      const formattedPermission = {
        id: permission.id,
        description: permission.description,
        date_creation: permission.date_creation,
        date_update: permission.date_update
      };
      
      res.status(200).json(formattedPermission);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching permission', error: (error as Error).message });
    }
  }

  async updatePermission(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description } = req.body;
      
      if (!description) {
        return res.status(400).json({ message: 'Description is required' });
      }

      // Verificar se já existe outra permissão com essa descrição
      const existingPermission = await prisma.permissions.findFirst({
        where: { 
          description,
          id: { not: id }
        }
      });

      if (existingPermission) {
        return res.status(400).json({ message: 'Another permission with this description already exists' });
      }

      const updatedPermission = await prisma.permissions.update({
        where: { id },
        data: { description }
      });
      
      // Formatar resultado para compatibilidade com PrismaPermissionRepository
      const formattedPermission = {
        id: updatedPermission.id,
        description: updatedPermission.description,
        date_creation: updatedPermission.date_creation,
        date_update: updatedPermission.date_update
      };
      
      res.status(200).json(formattedPermission);
    } catch (error) {
      res.status(500).json({ message: 'Error updating permission', error: (error as Error).message });
    }
  }

  async deletePermission(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Verificar se a permissão está em uso
      const permissionInUse = await prisma.groupPermissionsList.findFirst({
        where: { permission_id: id }
      });
      
      if (permissionInUse) {
        return res.status(400).json({ message: 'Cannot delete permission that is in use by permission groups' });
      }
      
      await prisma.permissions.delete({
        where: { id }
      });
      
      // PrismaPermissionRepository.delete não retorna nada (void)
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: 'Error deleting permission', error: (error as Error).message });
    }
  }
} 