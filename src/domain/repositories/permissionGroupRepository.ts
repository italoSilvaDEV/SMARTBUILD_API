import { PermissionGroup } from '../entities/permissionGroup';

export interface PermissionGroupRepository {
  create(groupData: Omit<PermissionGroup, 'id' | 'date_creation' | 'date_update'>): Promise<PermissionGroup>;
  findAll(): Promise<PermissionGroup[]>;
  findById(id: string): Promise<PermissionGroup | null>;
  findByDescription(description: string): Promise<PermissionGroup | null>;
  update(id: string, groupData: Partial<Omit<PermissionGroup, 'id' | 'date_creation' | 'date_update'>>): Promise<PermissionGroup | null>;
  delete(id: string): Promise<void>;
  addPermissions(groupId: string, permissionIds: string[]): Promise<PermissionGroup | null>;
  removePermissions(groupId: string, permissionIds: string[]): Promise<PermissionGroup | null>;
} 