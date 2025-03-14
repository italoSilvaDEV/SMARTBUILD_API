import { PermissionGroup } from '../../../domain/entities/permissionGroup';
import { PermissionGroupRepository } from '../../../domain/repositories/permissionGroupRepository';
import { prisma } from '../../../utils/prisma';

export class PrismaPermissionGroupRepository implements PermissionGroupRepository {
  async create(groupData: Omit<PermissionGroup, 'id' | 'date_creation' | 'date_update'>): Promise<PermissionGroup> {
    const group = await prisma.permissionGroup.create({
      data: {
        description: groupData.description
      }
    });

    return {
      id: group.id,
      description: group.description,
      date_creation: group.date_creation,
      date_update: group.date_update
    };
  }

  async findAll(): Promise<PermissionGroup[]> {
    const groups = await prisma.permissionGroup.findMany();
    return groups.map(group => ({
      id: group.id,
      description: group.description,
      date_creation: group.date_creation,
      date_update: group.date_update
    }));
  }

  async findById(id: string): Promise<PermissionGroup | null> {
    const group = await prisma.permissionGroup.findUnique({
      where: { id }
    });

    if (!group) return null;

    return {
      id: group.id,
      description: group.description,
      date_creation: group.date_creation,
      date_update: group.date_update
    };
  }

  async findByDescription(description: string): Promise<PermissionGroup | null> {
    const group = await prisma.permissionGroup.findFirst({
      where: { description }
    });

    if (!group) return null;

    return {
      id: group.id,
      description: group.description,
      date_creation: group.date_creation,
      date_update: group.date_update
    };
  }

  async update(id: string, groupData: Partial<Omit<PermissionGroup, 'id' | 'date_creation' | 'date_update'>>): Promise<PermissionGroup | null> {
    const group = await prisma.permissionGroup.update({
      where: { id },
      data: groupData
    });

    return {
      id: group.id,
      description: group.description,
      date_creation: group.date_creation,
      date_update: group.date_update
    };
  }

  async delete(id: string): Promise<void> {
    await prisma.permissionGroup.delete({
      where: { id }
    });
  }

  async addPermissions(groupId: string, permissionIds: string[]): Promise<PermissionGroup | null> {
    // Adiciona permissões ao grupo
    await Promise.all(
      permissionIds.map(permissionId =>
        prisma.groupPermissionsList.create({
          data: {
            permission_id: permissionId,
            permission_group: groupId
          }
        })
      )
    );

    return this.findById(groupId);
  }

  async removePermissions(groupId: string, permissionIds: string[]): Promise<PermissionGroup | null> {
    // Remove permissões do grupo
    await prisma.groupPermissionsList.deleteMany({
      where: {
        permission_group: groupId,
        permission_id: { in: permissionIds }
      }
    });

    return this.findById(groupId);
  }
} 