import { Permission } from '../entities/permission';

export interface PermissionRepository {
  create(permissionData: Omit<Permission, 'id' | 'date_creation' | 'date_update'>): Promise<Permission>;
  findAll(): Promise<Permission[]>;
  findById(id: string): Promise<Permission | null>;
  findByDescription(description: string): Promise<Permission | null>;
  update(id: string, permissionData: Partial<Omit<Permission, 'id' | 'date_creation' | 'date_update'>>): Promise<Permission | null>;
  delete(id: string): Promise<void>;
  isPermissionInUse(id: string): Promise<boolean>;
} 