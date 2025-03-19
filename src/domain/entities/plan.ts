export enum ValidityType {
  FREE = 'FREE',
  MONTHLY = 'MONTHLY',
  ANNUAL = 'ANNUAL',
  CUSTOM = 'CUSTOM',
  DAYS = 'DAYS'
}

export interface Plan {
  id: string;
  name: string;
  description: string;
  price: number | null;
  features: any; // This will be a JSON string in the database
  validityType: ValidityType;
  validityDuration: number;
  permissionGroupId: string;
  createdAt: Date;
  updatedAt: Date;
} 