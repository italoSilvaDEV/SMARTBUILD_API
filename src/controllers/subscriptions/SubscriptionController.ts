import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';
import { grantOwnerFullAccessForCompany } from '../../utils/ownerFullAccess';
import { Prisma } from '@prisma/client';

class FreeSubscriptionError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Initializes permissions only for a new or unconfigured default office. */
async function applyPermissionsToOffice(db: Prisma.TransactionClient, officeId: string, permissionIds: string[]): Promise<void> {
  if (permissionIds.length === 0) return;
  await db.userPermission.createMany({
    data: permissionIds.map((permission_id) => ({
      office_id: officeId,
      permission_id,
      editAll: false
    }))
  });
}

export class SubscriptionController {
  async create(req: Request, res: Response) {
    try {
      const { companyId, planId, campaignId } = req.body;

      if (typeof companyId !== 'string' || !companyId || typeof planId !== 'string' || !planId
        || (campaignId != null && typeof campaignId !== 'string')) {
        return res.status(400).json({ message: 'Company and plan are required' });
      }

      const userId = (req as any).userId as string | undefined;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const subscription = await prisma.$transaction(async (db) => {
        const actor = await db.user.findUnique({
          where: { id: userId },
          select: { isDisabled: true, company_id: true, office: { select: { name: true, company_id: true } },
            companies: { select: { companyId: true, office: { select: { name: true } } } } },
        });
        const master = actor && !actor.isDisabled && actor.office?.name?.trim().toLowerCase() === 'master'
          && actor.office.company_id == null && actor.company_id == null && actor.companies.length === 0;
        const link = actor?.companies.find(item => item.companyId === companyId);
        const officeName = link?.office.name ?? (actor?.company_id === companyId ? actor.office?.name : null);
        const companyManager = ['owner', 'administrator'].includes(officeName?.trim().toLowerCase() ?? '');
        if (!actor || actor.isDisabled || (!master && !companyManager)) {
          throw new FreeSubscriptionError(403, 'Company administrator access is required');
        }

        const plan = await db.plan.findUnique({
          where: { id: planId },
          include: { permissionGroup: { include: { GroupPermissionsList: { select: { permission_id: true } } } } }
        });

        if (!plan) {
          throw new FreeSubscriptionError(400, 'Plan not found');
        }

        if (plan.validityType !== 'FREE') {
          throw new FreeSubscriptionError(400, 'This endpoint is only for FREE plan subscription. Use Stripe checkout for paid plans.');
        }

        const company = await db.company.findUnique({
          where: { id: companyId }
        });

        if (!company) {
          throw new FreeSubscriptionError(400, 'Company not found');
        }

        // Serializable keeps concurrent calls to this endpoint from both accepting an empty active set.
        if (await db.subscription.findFirst({ where: { companyId, isActive: true }, select: { id: true } })) {
          throw new FreeSubscriptionError(409, 'Company already has an active subscription');
        }

        if (plan.isInviteOnly) {
          const redeemedInvite = await db.planInvite.findFirst({
            where: {
              planId,
              usedByCompanyId: companyId,
              status: 'USED'
            },
            select: { id: true }
          });

          if (!redeemedInvite) {
            throw new FreeSubscriptionError(403, 'This plan requires a valid one-time invitation');
          }
        }

        let fromCampaign = false;
        if (campaignId) {
          const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
          if (!campaign) {
            throw new FreeSubscriptionError(400, 'Campaign not found');
          }
          if (!campaign.isActive || campaign.endDate < new Date()) {
            throw new FreeSubscriptionError(400, 'Campaign inactive or expired');
          }
          if (campaign.planId !== planId) {
            throw new FreeSubscriptionError(400, 'Plan does not match campaign plan');
          }
          fromCampaign = true;
        }

        const startDateObj = new Date();
        const endDateObj = new Date(startDateObj);
        endDateObj.setDate(endDateObj.getDate() + (plan.validityDuration ?? 0));

        const subscription = await db.subscription.create({
          data: {
            companyId,
            planId,
            startDate: startDateObj,
            endDate: endDateObj,
            isActive: true,
            fromCampaign,
            campaignId: campaignId || null
          }
        });

        await db.company.update({
          where: { id: companyId },
          data: {
            planId,
            allowedEmployees: company.allowedEmployees ?? plan.allowedEmployees
          }
        });

        const ownerOffice = await db.office.findFirst({
          where: { company_id: companyId, name: 'Owner' },
          include: { userPermissions: true }
        });

        const permissionIds = plan.permissionGroup.GroupPermissionsList.map((row) => row.permission_id);

        if (ownerOffice && ownerOffice.userPermissions.length === 0) {
          await applyPermissionsToOffice(db, ownerOffice.id, permissionIds);
        }
        await grantOwnerFullAccessForCompany(companyId, db);

        if (!await db.office.findFirst({ where: { company_id: companyId, name: 'Worker' } })) {
          await db.office.create({ data: { name: 'Worker', company_id: companyId } });
        }
        // Existing roles and their editAll/custom permissions survive a new trial.
        if (!await db.office.findFirst({ where: { company_id: companyId, name: 'Administrator' } })) {
          const adminOffice = await db.office.create({ data: { name: 'Administrator', company_id: companyId } });
          await applyPermissionsToOffice(db, adminOffice.id, permissionIds);
        }
        return subscription;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      const formattedSubscription = {
        id: subscription.id,
        companyId: subscription.companyId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive,
        fromCampaign: subscription.fromCampaign,
        campaignId: subscription.campaignId
      };

      res.status(201).json(formattedSubscription);
    } catch (error) {
      if (error instanceof FreeSubscriptionError) return res.status(error.status).json({ message: error.message });
      if ((error as { code?: string }).code === 'P2034') {
        return res.status(409).json({ message: 'Subscription creation conflicted with another request. Refresh subscription status before retrying.' });
      }
      console.error('Error creating subscription:', error);
      res.status(500).json({ message: 'Error creating subscription', error: (error as Error).message });
    }
  }

  async getAllSubscriptions(req: Request, res: Response) {
    try {
      const subscriptions = await prisma.subscription.findMany();
      
      // Formatar resultados para compatibilidade com PrismaSubscriptionRepository
      const formattedSubscriptions = subscriptions.map(subscription => ({
        id: subscription.id,
        companyId: subscription.companyId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive
      }));
      
      res.status(200).json(formattedSubscriptions);
    } catch (error) {
      console.error('Error listing subscriptions:', error);
      res.status(500).json({ message: 'Error listing subscriptions', error: (error as Error).message });
    }
  }

  async getSubscriptionById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const subscription = await prisma.subscription.findUnique({
        where: { id }
      });
      
      if (!subscription) {
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      // Formatar resultado para compatibilidade com PrismaSubscriptionRepository
      const formattedSubscription = {
        id: subscription.id,
        companyId: subscription.companyId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive
      };
      
      res.status(200).json(formattedSubscription);
    } catch (error) {
      console.error('Error fetching subscription:', error);
      res.status(500).json({ message: 'Error fetching subscription', error: (error as Error).message });
    }
  }

  async getSubscriptionsByCompany(req: Request, res: Response) {
    try {
      const { companyId } = req.params;
      const subscriptions = await prisma.subscription.findMany({
        where: { companyId }
      });
      
      // Formatar resultados para compatibilidade com PrismaSubscriptionRepository
      const formattedSubscriptions = subscriptions.map(subscription => ({
        id: subscription.id,
        companyId: subscription.companyId,
        planId: subscription.planId,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        isActive: subscription.isActive
      }));
      
      res.status(200).json(formattedSubscriptions);
    } catch (error) {
      console.error('Error fetching company subscriptions:', error);
      res.status(500).json({ message: 'Error fetching company subscriptions', error: (error as Error).message });
    }
  }

  async updateSubscription(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { planId, startDate, endDate, isActive } = req.body;
      
      // Verificar se a assinatura existe
      const existingSubscription = await prisma.subscription.findUnique({
        where: { id }
      });
      
      if (!existingSubscription) {
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      // Preparar os dados para atualização
      const updateData: any = {};
      
      if (planId !== undefined) {
        updateData.planId = planId;
      }
      
      if (startDate !== undefined) {
        updateData.startDate = new Date(startDate);
      }
      
      if (endDate !== undefined) {
        updateData.endDate = new Date(endDate);
      }
      
      if (isActive !== undefined) {
        updateData.isActive = isActive;
      }
      
      // Atualizar a assinatura
      const updatedSubscription = await prisma.subscription.update({
        where: { id },
        data: updateData
      });
      
      // Formatar resultado para compatibilidade com PrismaSubscriptionRepository
      const formattedSubscription = {
        id: updatedSubscription.id,
        companyId: updatedSubscription.companyId,
        planId: updatedSubscription.planId,
        startDate: updatedSubscription.startDate,
        endDate: updatedSubscription.endDate,
        isActive: updatedSubscription.isActive
      };
      
      res.status(200).json(formattedSubscription);
    } catch (error) {
      console.error('Error updating subscription:', error);
      res.status(500).json({ message: 'Error updating subscription', error: (error as Error).message });
    }
  }

  async cancelSubscription(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Verificar se a assinatura existe
      const existingSubscription = await prisma.subscription.findUnique({
        where: { id }
      });
      
      if (!existingSubscription) {
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      // Administrative local deactivation only; does not cancel provider billing.
      const canceledSubscription = await prisma.subscription.update({
        where: { id },
        data: { isActive: false }
      });
      
      // Formatar resultado para compatibilidade com PrismaSubscriptionRepository
      const formattedSubscription = {
        id: canceledSubscription.id,
        companyId: canceledSubscription.companyId,
        planId: canceledSubscription.planId,
        startDate: canceledSubscription.startDate,
        endDate: canceledSubscription.endDate,
        isActive: canceledSubscription.isActive,
        operationScope: 'local',
        providerActionPerformed: false,
        message: 'Local subscription deactivated. Provider billing was not canceled.'
      };
      
      res.status(200).json(formattedSubscription);
    } catch (error) {
      console.error('Error canceling subscription:', error);
      res.status(500).json({ message: 'Error canceling subscription', error: (error as Error).message });
    }
  }

  async renewSubscription(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { newEndDate } = req.body;
      
      // Verificar se a assinatura existe
      const existingSubscription = await prisma.subscription.findUnique({
        where: { id }
      });
      
      if (!existingSubscription) {
        res.status(404).json({ message: 'Subscription not found' });
        return;
      }
      
      const newEndDateObj = new Date(newEndDate);
      
      if (newEndDateObj <= existingSubscription.endDate) {
        return res.status(400).json({ message: 'A nova data de término deve ser posterior à atual' });
      }
      
      // Renovar a assinatura
      const renewedSubscription = await prisma.subscription.update({
        where: { id },
        data: { 
          endDate: newEndDateObj,
          isActive: true 
        }
      });
      
      // Formatar resultado para compatibilidade com PrismaSubscriptionRepository
      const formattedSubscription = {
        id: renewedSubscription.id,
        companyId: renewedSubscription.companyId,
        planId: renewedSubscription.planId,
        startDate: renewedSubscription.startDate,
        endDate: renewedSubscription.endDate,
        isActive: renewedSubscription.isActive
      };
      
      res.status(200).json(formattedSubscription);
    } catch (error) {
      console.error('Error renewing subscription:', error);
      res.status(500).json({ message: 'Error renewing subscription', error: (error as Error).message });
    }
  }
} 
