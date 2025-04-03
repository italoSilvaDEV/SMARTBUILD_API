import { Subscription } from '../../../domain/entities/subscription';
import { SubscriptionRepository } from '../../../domain/repositories/subscriptionRepository';
import { prisma } from '../../../utils/prisma';

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  async create(subscriptionData: Omit<Subscription, 'id'>): Promise<Subscription> {
    const subscription = await prisma.subscription.create({
      data: {
        companyId: subscriptionData.companyId,
        planId: subscriptionData.planId,
        startDate: subscriptionData.startDate,
        endDate: subscriptionData.endDate,
        isActive: subscriptionData.isActive
      }
    });

    return {
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      isActive: subscription.isActive
    };
  }

  async findAll(): Promise<Subscription[]> {
    const subscriptions = await prisma.subscription.findMany();
    return subscriptions.map(subscription => ({
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      isActive: subscription.isActive
    }));
  }

  async findById(id: string): Promise<Subscription | null> {
    const subscription = await prisma.subscription.findUnique({
      where: { id }
    });

    if (!subscription) return null;

    return {
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      isActive: subscription.isActive
    };
  }

  async findByCompany(companyId: string): Promise<Subscription[]> {
    const subscriptions = await prisma.subscription.findMany({
      where: { companyId }
    });

    return subscriptions.map(subscription => ({
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      isActive: subscription.isActive
    }));
  }

  async update(id: string, subscriptionData: Partial<Omit<Subscription, 'id' | 'companyId'>>): Promise<Subscription | null> {
    const subscription = await prisma.subscription.update({
      where: { id },
      data: subscriptionData
    });

    return {
      id: subscription.id,
      companyId: subscription.companyId,
      planId: subscription.planId,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      isActive: subscription.isActive
    };
  }

  async delete(id: string): Promise<void> {
    await prisma.subscription.delete({
      where: { id }
    });
  }
} 