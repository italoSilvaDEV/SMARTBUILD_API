export enum ValidityType {
  FREE = 'FREE',
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
  CUSTOM = 'CUSTOM'
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  validityType: ValidityType;
  validityDuration: number;
  permissionGroupId: string;
  createdAt: Date;
  updatedAt: Date;
} 