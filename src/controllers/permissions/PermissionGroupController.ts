import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class PermissionGroupController {
  async create(req: Request, res: Response) {
    try {
      const { description, permissions, selectedPermissions } = req.body;

      if (!description) {
        return res.status(400).json({ message: 'Description is required' });
      }

      // Verificar se já existe um grupo com essa descrição
      const existingGroup = await prisma.permissionGroup.findFirst({
        where: { description }
      });

      if (existingGroup) {
        return res.status(400).json({ message: 'Permission group with this description already exists' });
      }

      // Processar as permissões (aceita tanto o formato permissions quanto selectedPermissions)
      let permissionIds: string[] = [];
      
      if (permissions && Array.isArray(permissions) && permissions.length > 0) {
        // Formato antigo: array de IDs
        permissionIds = permissions;
      } else if (selectedPermissions && Array.isArray(selectedPermissions) && selectedPermissions.length > 0) {
        // Novo formato: array de objetos completos com campo id
        permissionIds = selectedPermissions.map(permission => permission.id);
      }

      // Transação para criar o grupo e adicionar permissões (se fornecidas)
      const group = await prisma.$transaction(async (prismaClient) => {
        // Criar o grupo
        const newGroup = await prismaClient.permissionGroup.create({
          data: { description }
        });

        // Adicionar permissões ao grupo (se fornecidas)
        if (permissionIds.length > 0) {
          await prismaClient.groupPermissionsList.createMany({
            data: permissionIds.map((permissionId: string) => ({
              permission_id: permissionId,
              permission_group: newGroup.id
            }))
          });
        }

        return newGroup;
      });

      // Buscar o grupo com suas permissões para o retorno
      const groupPermissions = await prisma.groupPermissionsList.findMany({
        where: { permission_group: group.id },
        include: { Permissions: true }
      });
      
      const formattedPermissions = groupPermissions.map(gp => ({
        id: gp.Permissions.id,
        description: gp.Permissions.description,
        date_creation: gp.Permissions.date_creation,
        date_update: gp.Permissions.date_update
      }));

      // Formatar o resultado para manter compatibilidade
      const formattedGroup = {
        id: group.id,
        description: group.description,
        date_creation: group.date_creation,
        date_update: group.date_update,
        permissions: formattedPermissions
      };

      res.status(201).json(formattedGroup);
    } catch (error) {
      // console.error('Error creating permission group:', error);
      res.status(500).json({ message: 'Error creating permission group', error: (error as Error).message });
    }
  }

  async getAllGroups(req: Request, res: Response) {
    try {
      const groups = await prisma.permissionGroup.findMany({
        orderBy: { description: 'asc' }
      });
      
      // Formatar os resultados para manter compatibilidade
      const formattedGroups = groups.map(group => ({
        id: group.id,
        description: group.description,
        date_creation: group.date_creation,
        date_update: group.date_update
      }));
      
      res.status(200).json(formattedGroups);
    } catch (error) {
      // console.error('Error fetching permission groups:', error);
      res.status(500).json({ message: 'Error fetching permission groups', error: (error as Error).message });
    }
  }

  async getGroupById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const group = await prisma.permissionGroup.findUnique({
        where: { id }
      });
      
      if (!group) {
        res.status(404).json({ message: 'Permission group not found' });
        return;
      }
      
      // Buscar as permissões associadas a este grupo
      const groupPermissions = await prisma.groupPermissionsList.findMany({
        where: { permission_group: id },
        include: { Permissions: true }
      });
      
      // Extrair apenas as permissões e formatá-las
      const permissions = groupPermissions.map(gp => ({
        id: gp.Permissions.id,
        description: gp.Permissions.description,
        date_creation: gp.Permissions.date_creation,
        date_update: gp.Permissions.date_update
      }));
      
      // Formatar o resultado final para manter compatibilidade
      const formattedGroup = {
        id: group.id,
        description: group.description,
        date_creation: group.date_creation,
        date_update: group.date_update,
        permissions
      };
      
      res.status(200).json(formattedGroup);
    } catch (error) {
      // console.error('Error fetching permission group:', error);
      res.status(500).json({ message: 'Error fetching permission group', error: (error as Error).message });
    }
  }

  async updateGroup(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { description, permissionIds } = req.body;
      
      if (!description) {
        return res.status(400).json({ message: 'Description is required' });
      }

      // Verificar se já existe outro grupo com essa descrição
      const existingGroup = await prisma.permissionGroup.findFirst({
        where: { 
          description,
          id: { not: id }
        }
      });

      if (existingGroup) {
        return res.status(400).json({ message: 'Another permission group with this description already exists' });
      }

      // Transação para atualizar o grupo e suas permissões
      await prisma.$transaction(async (prismaClient) => {
        // Atualizar a descrição do grupo
        await prismaClient.permissionGroup.update({
          where: { id },
          data: { description }
        });

        // Se permissionIds está presente, atualizar as permissões do grupo
        if (permissionIds && Array.isArray(permissionIds)) {
          // Remover todas as permissões atuais do grupo
          await prismaClient.groupPermissionsList.deleteMany({
            where: { permission_group: id }
          });

          // Adicionar as novas permissões
          if (permissionIds.length > 0) {
            await prismaClient.groupPermissionsList.createMany({
              data: permissionIds.map(permissionId => ({
                permission_id: permissionId,
                permission_group: id
              }))
            });
          }
        }
      });

      // Buscar o grupo atualizado
      const updatedGroup = await prisma.permissionGroup.findUnique({
        where: { id }
      });

      // Buscar as permissões associadas
      const groupPermissions = await prisma.groupPermissionsList.findMany({
        where: { permission_group: id },
        include: { Permissions: true }
      });
      
      const formattedPermissions = groupPermissions.map(gp => ({
        id: gp.Permissions.id,
        description: gp.Permissions.description,
        date_creation: gp.Permissions.date_creation,
        date_update: gp.Permissions.date_update
      }));
      
      // Formatar o resultado para manter compatibilidade
      const formattedGroup = {
        id: updatedGroup?.id,
        description: updatedGroup?.description,
        date_creation: updatedGroup?.date_creation,
        date_update: updatedGroup?.date_update,
        permissions: formattedPermissions
      };
      
      res.status(200).json(formattedGroup);
    } catch (error) {
      // console.error('Error updating permission group:', error);
      res.status(500).json({ message: 'Error updating permission group', error: (error as Error).message });
    }
  }

  async deleteGroup(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Verificar se o grupo está em uso por planos
      const groupInUse = await prisma.plan.findFirst({
        where: { permissionGroupId: id }
      });
      
      if (groupInUse) {
        return res.status(400).json({ message: 'Cannot delete permission group that is in use by plans' });
      }
      
      // Remover todas as associações com permissões
      await prisma.$transaction([
        prisma.groupPermissionsList.deleteMany({
          where: { permission_group: id }
        }),
        prisma.permissionGroup.delete({
          where: { id }
        })
      ]);
      
      res.status(204).send();
    } catch (error) {
      // console.error('Error deleting permission group:', error);
      res.status(500).json({ message: 'Error deleting permission group', error: (error as Error).message });
    }
  }

  async addPermissionsToGroup(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { permissions } = req.body;
      
      if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ message: 'Permissions array is required' });
      }
      
      // Verificar se o grupo existe
      const group = await prisma.permissionGroup.findUnique({
        where: { id }
      });
      
      if (!group) {
        return res.status(404).json({ message: 'Permission group not found' });
      }
      
      // Verificar quais permissões já estão no grupo
      const existingPermissions = await prisma.groupPermissionsList.findMany({
        where: { 
          permission_group: id,
          permission_id: { in: permissions }
        }
      });
      
      const existingPermissionIds = existingPermissions.map(ep => ep.permission_id);
      
      // Filtrar apenas as novas permissões
      const newPermissions = permissions.filter(p => !existingPermissionIds.includes(p));
      
      if (newPermissions.length === 0) {
        return res.status(200).json({ message: 'All permissions are already in the group' });
      }
      
      // Adicionar as novas permissões
      await prisma.groupPermissionsList.createMany({
        data: newPermissions.map(permissionId => ({
          permission_id: permissionId,
          permission_group: id
        }))
      });
      
      // Buscar o grupo atualizado com suas permissões
      const updatedGroup = await prisma.permissionGroup.findUnique({
        where: { id }
      });
      
      const groupPermissions = await prisma.groupPermissionsList.findMany({
        where: { permission_group: id },
        include: { Permissions: true }
      });
      
      const formattedPermissions = groupPermissions.map(gp => ({
        id: gp.Permissions.id,
        description: gp.Permissions.description,
        date_creation: gp.Permissions.date_creation,
        date_update: gp.Permissions.date_update
      }));
      
      // Formatar o resultado final
      const formattedGroup = {
        id: updatedGroup?.id,
        description: updatedGroup?.description,
        date_creation: updatedGroup?.date_creation,
        date_update: updatedGroup?.date_update,
        permissions: formattedPermissions
      };
      
      res.status(200).json(formattedGroup);
    } catch (error) {
      // console.error('Error adding permissions to group:', error);
      res.status(500).json({ message: 'Error adding permissions to group', error: (error as Error).message });
    }
  }

  async removePermissionsFromGroup(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { permissions } = req.body;
      
      if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
        return res.status(400).json({ message: 'Permissions array is required' });
      }
      
      // Verificar se o grupo existe
      const group = await prisma.permissionGroup.findUnique({
        where: { id }
      });
      
      if (!group) {
        return res.status(404).json({ message: 'Permission group not found' });
      }
      
      // Remover as permissões do grupo
      await prisma.groupPermissionsList.deleteMany({
        where: {
          permission_group: id,
          permission_id: { in: permissions }
        }
      });
      
      // Buscar o grupo atualizado com suas permissões
      const groupPermissions = await prisma.groupPermissionsList.findMany({
        where: { permission_group: id },
        include: { Permissions: true }
      });
      
      const formattedPermissions = groupPermissions.map(gp => ({
        id: gp.Permissions.id,
        description: gp.Permissions.description,
        date_creation: gp.Permissions.date_creation,
        date_update: gp.Permissions.date_update
      }));
      
      // Formatar o resultado final
      const formattedGroup = {
        id: group.id,
        description: group.description,
        date_creation: group.date_creation,
        date_update: group.date_update,
        permissions: formattedPermissions
      };
      
      res.status(200).json(formattedGroup);
    } catch (error) {
      // console.error('Error removing permissions from group:', error);
      res.status(500).json({ message: 'Error removing permissions from group', error: (error as Error).message });
    }
  }

  async getAllPermissionGroups(req: Request, res: Response): Promise<void> {
    try {
      // Buscar todos os grupos
      const groups = await prisma.permissionGroup.findMany();
      
      // Buscar as permissões para cada grupo
      const formattedGroups = await Promise.all(groups.map(async group => {
        const groupPermissions = await prisma.groupPermissionsList.findMany({
          where: { permission_group: group.id },
          include: { Permissions: true }
        });
        
        return {
          id: group.id,
          description: group.description,
          date_creation: group.date_creation,
          date_update: group.date_update,
          permissions: groupPermissions.map(gp => ({
            id: gp.Permissions.id,
            description: gp.Permissions.description,
            date_creation: gp.Permissions.date_creation,
            date_update: gp.Permissions.date_update
          }))
        };
      }));
      
      res.status(200).json(formattedGroups);
    } catch (error) {
      // console.error('Error fetching permission groups:', error);
      res.status(500).json({
        message: 'Error fetching permission groups',
        error: (error as Error).message
      });
    }
  }
} 