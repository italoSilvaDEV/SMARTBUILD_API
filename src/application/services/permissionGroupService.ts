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
    return this.permissionGroupRepository.findAll();
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
  async addPermissionsToGroup(groupId: string, permissionIds: string[]): Promise<PermissionGroup | null> {
    // Verifica se o grupo existe
    const group = await this.permissionGroupRepository.findById(groupId);
    if (!group) {
      return null;
    }

    // Verifica se todas as permissões existem
    for (const permissionId of permissionIds) {
      const permission = await this.permissionRepository.findById(permissionId);
      if (!permission) {
        throw new Error(`Permissão com ID ${permissionId} não encontrada`);
      }
    }

    return this.permissionGroupRepository.addPermissions(groupId, permissionIds);
  }

  /**
   * Remove permissões de um grupo
   * @param groupId ID do grupo
   * @param permissionIds IDs das permissões a remover
   * @returns Grupo atualizado ou null
   */
  async removePermissionsFromGroup(groupId: string, permissionIds: string[]): Promise<PermissionGroup | null> {
    // Verifica se o grupo existe
    const group = await this.permissionGroupRepository.findById(groupId);
    if (!group) {
      return null;
    }

    return this.permissionGroupRepository.removePermissions(groupId, permissionIds);
  }

  /**
   * Atualiza um grupo de permissões
   * @param id ID do grupo
   * @param groupData Dados atualizados do grupo
   * @returns Grupo atualizado ou null
   */
  async updatePermissionGroup(id: string, groupData: {
    description: string;
  }): Promise<PermissionGroup | null> {
    // Verifica se o grupo existe
    const existingGroup = await this.permissionGroupRepository.findById(id);
    if (!existingGroup) {
      return null;
    }

    // Validação dos dados
    if (!groupData.description) {
      throw new Error('Descrição é obrigatória');
    }

    // Verifica se já existe outro grupo com a mesma descrição
    const duplicateGroup = await this.permissionGroupRepository.findByDescription(groupData.description);
    if (duplicateGroup && duplicateGroup.id !== id) {
      throw new Error('Já existe outro grupo com esta descrição');
    }

    return this.permissionGroupRepository.update(id, groupData);
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