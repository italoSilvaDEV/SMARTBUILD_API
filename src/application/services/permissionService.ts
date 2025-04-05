import { PermissionRepository } from '../../domain/repositories/permissionRepository';
import { Permission } from '../../domain/entities/permission';

export class PermissionService {
  constructor(private permissionRepository: PermissionRepository) {}

  /**
   * Creates a new permission
   * @param permissionData Permission data
   * @returns Created permission
   */
  async createPermission(permissionData: {
    description: string;
  }): Promise<Permission> {
    // Validação dos dados
    if (!permissionData.description) {
      throw new Error('Description is required'); // Descrição é obrigatória
    }

    // Verifica se já existe uma permissão com a mesma descrição
    const existingPermission = await this.permissionRepository.findByDescription(permissionData.description);
    if (existingPermission) {
      throw new Error('A permission with this description already exists'); // Já existe uma permissão com esta descrição
    }

    return this.permissionRepository.create(permissionData);
  }

  /**
   * Lists all permissions
   * @returns List of permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    return this.permissionRepository.findAll();
  }

  /**
   * Finds a permission by ID
   * @param id Permission ID
   * @returns Found permission or null
   */
  async getPermissionById(id: string): Promise<Permission | null> {
    return this.permissionRepository.findById(id);
  }

  /**
   * Updates an existing permission
   * @param id Permission ID
   * @param permissionData Updated permission data
   * @returns Updated permission or null
   */
  async updatePermission(id: string, permissionData: {
    description: string;
  }): Promise<Permission | null> {
    // Verifica se a permissão existe
    const existingPermission = await this.permissionRepository.findById(id);
    if (!existingPermission) {
      return null;
    }

    // Validação dos dados
    if (!permissionData.description) {
      throw new Error('Description is required'); // Descrição é obrigatória
    }

    // Verifica se já existe outra permissão com a mesma descrição
    const duplicatePermission = await this.permissionRepository.findByDescription(permissionData.description);
    if (duplicatePermission && duplicatePermission.id !== id) {
      throw new Error('Another permission with this description already exists'); // Já existe outra permissão com esta descrição
    }

    return this.permissionRepository.update(id, permissionData);
  }

  /**
   * Removes a permission
   * @param id Permission ID
   * @returns void
   */
  async deletePermission(id: string): Promise<void> {
    // Verifica se a permissão existe
    const existingPermission = await this.permissionRepository.findById(id);
    if (!existingPermission) {
      throw new Error('Permission not found'); // Permissão não encontrada
    }

    // Verifica se a permissão está sendo usada em algum grupo
    const isInUse = await this.permissionRepository.isPermissionInUse(id);
    if (isInUse) {
      throw new Error('Cannot delete a permission that is in use by groups'); // Não é possível excluir uma permissão que está sendo utilizada em grupos
    }

    await this.permissionRepository.delete(id);
  }
} 