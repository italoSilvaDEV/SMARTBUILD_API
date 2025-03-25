import { Plan } from '../entities/plan';
import { PermissionGroup } from '../entities/permissionGroup';

export interface PlanRepository {
  create(planData: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan>;
  findAll(): Promise<Plan[]>;
  findById(id: string): Promise<Plan | null>;
  update(id: string, planData: Partial<Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Plan | null>;
  delete(id: string): Promise<void>;
  hasAssociations(id: string): Promise<boolean>;
  findPermissionGroupById(groupId: string): Promise<PermissionGroup | null>;
} 