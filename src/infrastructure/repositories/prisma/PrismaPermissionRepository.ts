import { Permission } from '../../../domain/entities/permission';
import { PermissionRepository } from '../../../domain/repositories/permissionRepository';
import { prisma } from '../../../utils/prisma';

export class PrismaPermissionRepository implements PermissionRepository {
  async create(permissionData: Omit<Permission, 'id' | 'date_creation' | 'date_update'>): Promise<Permission> {
    const permission = await prisma.permissions.create({
      data: {
        description: permissionData.description
      }
    });

    return {
      id: permission.id,
      description: permission.description,
      date_creation: permission.date_creation,
      date_update: permission.date_update
    };
  }

  async findAll(): Promise<Permission[]> {
    const permissions = await prisma.permissions.findMany();
    return permissions.map(permission => ({
      id: permission.id,
      description: permission.description,
      date_creation: permission.date_creation,
      date_update: permission.date_update
    }));
  }

  async findById(id: string): Promise<Permission | null> {
    const permission = await prisma.permissions.findUnique({
      where: { id }
    });

    if (!permission) return null;

    return {
      id: permission.id,
      description: permission.description,
      date_creation: permission.date_creation,
      date_update: permission.date_update
    };
  }

  async findByDescription(description: string): Promise<Permission | null> {
    const permission = await prisma.permissions.findFirst({
      where: { description }
    });

    if (!permission) return null;

    return {
      id: permission.id,
      description: permission.description,
      date_creation: permission.date_creation,
      date_update: permission.date_update
    };
  }

  async update(id: string, permissionData: Partial<Omit<Permission, 'id' | 'date_creation' | 'date_update'>>): Promise<Permission | null> {
    const permission = await prisma.permissions.update({
      where: { id },
      data: permissionData
    });

    return {
      id: permission.id,
      description: permission.description,
      date_creation: permission.date_creation,
      date_update: permission.date_update
    };
  }

  async delete(id: string): Promise<void> {
    await prisma.permissions.delete({
      where: { id }
    });
  }

  async isPermissionInUse(id: string): Promise<boolean> {
    // Verifica se a permissão está sendo usada em algum grupo
    const count = await prisma.groupPermissionsList.count({
      where: { permission_id: id }
    });

    return count > 0;
  }

  async findByGroupId(groupId: string): Promise<Permission[]> {
    return await prisma.groupPermissionsList.findMany({
      where: { permission_group: groupId },
      include: { Permissions: true } // Ensure this is correct based on your schema
    }).then(groupPermissions => groupPermissions.map(gp => gp.Permissions));
  }

  async addPermissionsToGroup(groupId: string, permissionIds: string[]): Promise<void> {
    await Promise.all(permissionIds.map(permissionId => {
      return prisma.groupPermissionsList.create({
        data: {
          permission_id: permissionId,
          permission_group: groupId
        }
      });
    }));
  }
} 