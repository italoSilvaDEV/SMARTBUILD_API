import { Permission } from './permission';

export interface PermissionGroup {
  id: string;
  description: string;
  date_creation: Date;
  date_update: Date;
  permissions?: Permission[];
} 