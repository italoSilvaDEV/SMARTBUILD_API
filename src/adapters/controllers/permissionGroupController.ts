import { Request, Response } from 'express';
import { PermissionGroupService } from '../../application/services/permissionGroupService';

export class PermissionGroupController {
  constructor(private permissionGroupService: PermissionGroupService) {}

  /**
   * Creates a new permission group
   * @param req Request with group data
   * @param res API response
   */
  async createPermissionGroup(req: Request, res: Response): Promise<void> {
    try {
      const { description } = req.body;
      
      const permissionGroup = await this.permissionGroupService.createPermissionGroup({
        description
      });
      
      res.status(201).json(permissionGroup);
    } catch (error: unknown) {
      // Erro ao criar grupo de permissões
      console.error('Error creating permission group:', error);
      res.status(500).json({ message: 'Error creating permission group', error: (error as Error).message });
    }
  }

  /**
   * Lists all permission groups
   * @param req Request
   * @param res API response
   */
  async getAllPermissionGroups(req: Request, res: Response): Promise<void> {
    try {
      const permissionGroups = await this.permissionGroupService.getAllPermissionGroups();
      res.status(200).json(permissionGroups);
    } catch (error: unknown) {
      // Erro ao listar grupos de permissões
      console.error('Error listing permission groups:', error);
      res.status(500).json({ message: 'Error listing permission groups', error: (error as Error).message });
    }
  }

  /**
   * Finds a permission group by ID
   * @param req Request with group ID
   * @param res API response
   */
  async getPermissionGroupById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const permissionGroup = await this.permissionGroupService.getPermissionGroupById(id);
      
      if (!permissionGroup) {
        // Grupo de permissões não encontrado
        res.status(404).json({ message: 'Permission group not found' });
        return;
      }
      
      res.status(200).json(permissionGroup);
    } catch (error: unknown) {
      // Erro ao buscar grupo de permissões
      console.error('Error fetching permission group:', error);
      res.status(500).json({ message: 'Error fetching permission group', error: (error as Error).message });
    }
  }

  /**
   * Adds permissions to a group
   * @param req Request with group ID and permission IDs
   * @param res API response
   */
  async addPermissionsToGroup(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { permissionIds } = req.body;
      
      const updatedGroup = await this.permissionGroupService.addPermissionsToGroup(id, permissionIds);
      
      if (!updatedGroup) {
        // Grupo de permissões não encontrado
        res.status(404).json({ message: 'Permission group not found' });
        return;
      }
      
      res.status(200).json(updatedGroup);
    } catch (error: unknown) {
      // Erro ao adicionar permissões ao grupo
      console.error('Error adding permissions to group:', error);
      res.status(500).json({ message: 'Error adding permissions to group', error: (error as Error).message });
    }
  }

  /**
   * Removes permissions from a group
   * @param req Request with group ID and permission IDs
   * @param res API response
   */
  async removePermissionsFromGroup(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { permissionIds } = req.body;
      
      const updatedGroup = await this.permissionGroupService.removePermissionsFromGroup(id, permissionIds);
      
      if (!updatedGroup) {
        // Grupo de permissões não encontrado
        res.status(404).json({ message: 'Permission group not found' });
        return;
      }
      
      res.status(200).json(updatedGroup);
    } catch (error: unknown) {
      // Erro ao remover permissões do grupo
      console.error('Error removing permissions from group:', error);
      res.status(500).json({ message: 'Error removing permissions from group', error: (error as Error).message });
    }
  }

  /**
   * Updates a permission group
   * @param req Request with updated group data
   * @param res API response
   */
  async updatePermissionGroup(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { description } = req.body;
      
      const updatedGroup = await this.permissionGroupService.updatePermissionGroup(id, {
        description
      });
      
      if (!updatedGroup) {
        // Grupo de permissões não encontrado
        res.status(404).json({ message: 'Permission group not found' });
        return;
      }
      
      res.status(200).json(updatedGroup);
    } catch (error: unknown) {
      // Erro ao atualizar grupo de permissões
      console.error('Error updating permission group:', error);
      res.status(500).json({ message: 'Error updating permission group', error: (error as Error).message });
    }
  }

  /**
   * Removes a permission group
   * @param req Request with group ID
   * @param res API response
   */
  async deletePermissionGroup(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.permissionGroupService.deletePermissionGroup(id);
      res.status(204).send();
    } catch (error: unknown) {
      // Erro ao excluir grupo de permissões
      console.error('Error deleting permission group:', error);
      res.status(500).json({ message: 'Error deleting permission group', error: (error as Error).message });
    }
  }
} 