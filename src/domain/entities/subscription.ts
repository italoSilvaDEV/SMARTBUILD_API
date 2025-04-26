export interface Subscription {
  id: string;
  companyId: string;
  planId: string;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
} 