import { Request, Response } from 'express';
import { PermissionService } from '../../application/services/permissionService';

export class PermissionController {
  constructor(private permissionService: PermissionService) {}

  /**
   * Creates a new permission
   * @param req Request with permission data
   * @param res API response
   */
  async createPermission(req: Request, res: Response): Promise<void> {
    try {
      const { description } = req.body;
      
      const permission = await this.permissionService.createPermission({
        description
      });
      
      res.status(201).json(permission);
    } catch (error: unknown) {
      // Erro ao criar permissão
      // console.error('Error creating permission:', error);
      res.status(500).json({ message: 'Error creating permission', error: (error as Error).message });
    }
  }

  /**
   * Lists all permissions
   * @param req Request
   * @param res API response
   */
  async getAllPermissions(req: Request, res: Response): Promise<void> {
    try {
      const permissions = await this.permissionService.getAllPermissions();
      res.status(200).json(permissions);
    } catch (error: unknown) {
      // Erro ao listar permissões
      // console.error('Error listing permissions:', error);
      res.status(500).json({ message: 'Error listing permissions', error: (error as Error).message });
    }
  }

  /**
   * Finds a permission by ID
   * @param req Request with permission ID
   * @param res API response
   */
  async getPermissionById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const permission = await this.permissionService.getPermissionById(id);
      
      if (!permission) {
        // Permissão não encontrada
        res.status(404).json({ message: 'Permission not found' });
        return;
      }
      
      res.status(200).json(permission);
    } catch (error: unknown) {
      // Erro ao buscar permissão
      // console.error('Error fetching permission:', error);
      res.status(500).json({ message: 'Error fetching permission', error: (error as Error).message });
    }
  }

  /**
   * Updates an existing permission
   * @param req Request with updated permission data
   * @param res API response
   */
  async updatePermission(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { description } = req.body;
      
      const updatedPermission = await this.permissionService.updatePermission(id, {
        description
      });
      
      if (!updatedPermission) {
        // Permissão não encontrada
        res.status(404).json({ message: 'Permission not found' });
        return;
      }
      
      res.status(200).json(updatedPermission);
    } catch (error: unknown) {
      // Erro ao atualizar permissão
      // console.error('Error updating permission:', error);
      res.status(500).json({ message: 'Error updating permission', error: (error as Error).message });
    }
  }

  /**
   * Removes a permission
   * @param req Request with permission ID
   * @param res API response
   */
  async deletePermission(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      await this.permissionService.deletePermission(id);
      res.status(204).send();
    } catch (error: unknown) {
      // Erro ao excluir permissão
      // console.error('Error deleting permission:', error);
      res.status(500).json({ message: 'Error deleting permission', error: (error as Error).message });
    }
  }
} 