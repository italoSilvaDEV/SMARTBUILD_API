import { Subscription } from '../entities/subscription';

export interface SubscriptionRepository {
  create(subscriptionData: Omit<Subscription, 'id'>): Promise<Subscription>;
  findAll(): Promise<Subscription[]>;
  findById(id: string): Promise<Subscription | null>;
  findByCompany(companyId: string): Promise<Subscription[]>;
  update(id: string, subscriptionData: Partial<Omit<Subscription, 'id' | 'companyId'>>): Promise<Subscription | null>;
  delete(id: string): Promise<void>;
} 