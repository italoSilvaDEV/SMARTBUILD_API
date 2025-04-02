import { PermissionGroupRepository } from '../../domain/repositories/permissionGroupRepository';
import { PermissionRepository } from '../../domain/repositories/permissionRepository';
import { PermissionGroup } from '../../domain/entities/permissionGroup';

export class PermissionGroupService {
  constructor(
    private permissionGroupRepository: PermissionGroupRepository,
    private permissionRepository: PermissionRepository
  ) {}

  /**
   * Cria um novo grupo de permissões
   * @param groupData Dados do grupo
   * @returns Grupo criado
   */
  async createPermissionGroup(groupData: {
    description: string;
  }): Promise<PermissionGroup> {
    // Validação dos dados
    if (!groupData.description) {
      throw new Error('Descrição é obrigatória');
    }

    // Verifica se já existe um grupo com a mesma descrição
    const existingGroup = await this.permissionGroupRepository.findByDescription(groupData.description);
    if (existingGroup) {
      throw new Error('Já existe um grupo com esta descrição');
    }

    return this.permissionGroupRepository.create(groupData);
  }

  /**
   * Lista todos os grupos de permissões
   * @returns Lista de grupos
   */
  async getAllPermissionGroups(): Promise<PermissionGroup[]> {
    const groups = await this.permissionGroupRepository.findAll();

    // Fetch permissions for each group
    const groupsWithPermissions = await Promise.all(groups.map(async (group) => {
      const permissions = await this.permissionRepository.findByGroupId(group.id);
      return {
        ...group,
        permissions
      };
    }));

    return groupsWithPermissions;
  }

  /**
   * Busca um grupo de permissões pelo ID
   * @param id ID do grupo
   * @returns Grupo encontrado ou null
   */
  async getPermissionGroupById(id: string): Promise<PermissionGroup | null> {
    return this.permissionGroupRepository.findById(id);
  }

  /**
   * Adiciona permissões a um grupo
   * @param groupId ID do grupo
   * @param permissionIds IDs das permissões a adicionar
   * @returns Grupo atualizado ou null
   */
  async addPermissionsToGroup(groupId: string, permissionIds: string[]): Promise<void> {
    await Promise.all(permissionIds.map(permissionId => {
      return this.permissionRepository.findById(permissionId).then(permission => {
        if (!permission) {
          throw new Error(`Permission with ID ${permissionId} not found`);
        }
        return this.permissionGroupRepository.addPermissions(groupId, [permissionId]);
      });
    }));
  }

  /**
   * Remove permissões de um grupo
   * @param groupId ID do grupo
   * @param permissionIds IDs das permissões a remover
   * @returns Grupo atualizado ou null
   */
  async removePermissionsFromGroup(groupId: string, permissionIds: string[]): Promise<void> {
    // Check if the group exists
    const group = await this.permissionGroupRepository.findById(groupId);
    if (!group) {
      throw new Error('Permission group not found');
    }

    // Remove the permissions from the group
    await this.permissionGroupRepository.removePermissions(groupId, permissionIds);
  }

  /**
   * Atualiza um grupo de permissões
   * @param id ID do grupo
   * @param groupData Dados atualizados do grupo
   * @returns Grupo atualizado ou null
   */
  async updatePermissionGroup(id: string, groupData: {
    description: string;
    permissionIds: string[];
  }): Promise<PermissionGroup | null> {
    // Check if the group exists
    const existingGroup = await this.permissionGroupRepository.findById(id);
    if (!existingGroup) {
      return null;
    }

    // Validate the data
    if (!groupData.description) {
      throw new Error('Description is required');
    }

    // Update the group description
    await this.permissionGroupRepository.update(id, {
      description: groupData.description
    });

    // Remove all existing permissions if they exist
    if (existingGroup.permissions) {
      await this.removePermissionsFromGroup(id, existingGroup.permissions.map(p => p.id));
    }

    // Add the new permissions
    await this.addPermissionsToGroup(id, groupData.permissionIds);

    return this.permissionGroupRepository.findById(id);
  }

  /**
   * Remove um grupo de permissões
   * @param id ID do grupo
   * @returns void
   */
  async deletePermissionGroup(id: string): Promise<void> {
    // Verifica se o grupo existe
    const existingGroup = await this.permissionGroupRepository.findById(id);
    if (!existingGroup) {
      throw new Error('Grupo de permissões não encontrado');
    }

    await this.permissionGroupRepository.delete(id);
  }
} 