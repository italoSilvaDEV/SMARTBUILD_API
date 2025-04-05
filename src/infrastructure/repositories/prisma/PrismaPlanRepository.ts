import { Plan, ValidityType } from '../../../domain/entities/plan';
import { PlanRepository } from '../../../domain/repositories/planRepository';
import { prisma } from '../../../utils/prisma';
import { PermissionGroup } from '../../../domain/entities/permissionGroup';

export class PrismaPlanRepository implements PlanRepository {
  async create(planData: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan> {
    const plan = await prisma.plan.create({
      data: {
        name: planData.name,
        description: planData.description,
        price: planData.price,
        features: planData.features,
        validityType: planData.validityType,
        validityDuration: planData.validityDuration,
        permissionGroupId: planData.permissionGroupId
      }
    });

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price?.toNumber() || null,
      features: plan.features,
      validityType: plan.validityType as ValidityType,
      validityDuration: plan.validityDuration,
      permissionGroupId: plan.permissionGroupId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };
  }

  async findAll(): Promise<Plan[]> {
    const plans = await prisma.plan.findMany({
      include: {
        permissionGroup: true
      }
    });

    return plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price?.toNumber() || null,
      features: plan.features,
      validityType: plan.validityType as ValidityType,
      validityDuration: plan.validityDuration,
      permissionGroupId: plan.permissionGroupId,
      permissionGroup: plan.permissionGroup,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    }));
  }

  async findById(id: string): Promise<Plan | null> {
    const plan = await prisma.plan.findUnique({
      where: { id }
    });

    if (!plan) return null;

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price?.toNumber() || null,
      features: plan.features,
      validityType: plan.validityType as ValidityType,
      validityDuration: plan.validityDuration,
      permissionGroupId: plan.permissionGroupId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };
  }

  async update(id: string, planData: Partial<Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Plan | null> {
    const plan = await prisma.plan.update({
      where: { id },
      data: planData
    });

    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      price: plan.price?.toNumber() || null,
      features: plan.features,
      validityType: plan.validityType as ValidityType,
      validityDuration: plan.validityDuration,
      permissionGroupId: plan.permissionGroupId,
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt
    };
  }

  async delete(id: string): Promise<void> {
    await prisma.plan.delete({
      where: { id }
    });
  }

  async hasAssociations(id: string): Promise<boolean> {
    // Verifica se há empresas ou assinaturas usando este plano
    const subscriptionsCount = await prisma.subscription.count({
      where: { planId: id }
    });

    const companiesCount = await prisma.company.count({
      where: { planId: id }
    });

    return subscriptionsCount > 0 || companiesCount > 0;
  }

  async findPermissionGroupById(groupId: string): Promise<PermissionGroup | null> {
    return await prisma.permissionGroup.findUnique({
      where: { id: groupId }
    });
  }
} 