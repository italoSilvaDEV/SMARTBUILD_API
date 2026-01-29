import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class SubscriptionController {
  async create(req: Request, res: Response) {
    try {
      const { companyId, planId, startDate, endDate, campaignId } = req.body;
      
      // Validações
      if (!companyId || !planId) {
        return res.status(400).json({ message: 'Empresa e plano são obrigatórios' });
      }
 
      if (!startDate || !endDate) {
        return res.status(400).json({ message: 'Datas de início e fim são obrigatórias' });
      } 

      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);

      if (startDateObj >= endDateObj) {
        return res.status(400).json({ message: 'A data de início deve ser anterior à data de fim' });
      }

      // Buscar o plano para obter allowedEmployees
      const plan = await prisma.plan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        return res.status(400).json({ message: 'Plano não encontrado' });
      }

      // Buscar a empresa para verificar allowedEmployees atual
      const company = await prisma.company.findUnique({
        where: { id: companyId }
      });

      if (!company) {
        return res.status(400).json({ message: 'Empresa não encontrada' });
      }

      // Se há campaignId, verificar se a campanha existe e está ativa
      let fromCampaign = false;
      if (campaignId) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId }
        });

        if (!campaign) {
          return res.status(400).json({ message: 'Campanha não encontrada' });
        }

        if (!campaign.isActive || campaign.endDate < new Date()) {
          return res.status(400).json({ message: 'Campanha inativa ou expirada' });
        }

        if (campaign.planId !== planId) {
          return res.status(400).json({ message: 'O plano não corresponde ao plano da campanha' });
        }

        fromCampaign = true;
      }

      // Criar a assinatura
      const subscription = await prisma.subscription.create({
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

      // Atualizar a empresa com o novo planId e allowedEmployees do plano
      await prisma.company.update({ 
        where: { id: companyId }, 
        data: { 
          planId,
          // Se a empresa não tem allowedEmployees definido, usar o do plano
          allowedEmployees: company.allowedEmployees ?? plan.allowedEmployees
        } 
      });
      
      // Formatar resposta para compatibilidade com PrismaSubscriptionRepository
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
      
      // Cancelar a assinatura
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
        isActive: canceledSubscription.isActive
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