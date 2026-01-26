import { Request, Response } from 'express';
import { prisma } from '../../utils/prisma';

export class CampaignController {
  // Criar nova campanha
  async create(req: Request, res: Response) {
    try {
      const { name, description, planId, startDate, endDate } = req.body;
      
      // Validar se o plano existe e é um plano de campanha
      const plan = await prisma.plan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        return res.status(404).json({ message: 'Plan not found' });
      }

      if (!plan.isCampaign) {
        return res.status(400).json({ 
          message: 'The selected plan is not configured for campaigns. Please select a campaign plan.' 
        });
      }

      // Validar datas
      const now = new Date();
      const startDateTime = startDate ? new Date(startDate) : null;
      const endDateTime = new Date(endDate);

    //   if (startDateTime && startDateTime < now) {
    //     return res.status(400).json({ 
    //       message: 'The campaign start date must be in the future' 
    //     });
    //   }

      if (endDateTime <= now) {
        return res.status(400).json({ 
          message: 'The campaign end date must be in the future' 
        });
      }

      if (startDateTime && endDateTime <= startDateTime) {
        return res.status(400).json({ 
          message: 'The campaign end date must be after the start date' 
        });
      }

      const campaign = await prisma.campaign.create({
        data: {
          name,
          description: description || null,
          planId,
          startDate: startDateTime,
          endDate: endDateTime,
          isActive: true
        },
        include: {
          plan: {
            include: {
              permissionGroup: true
            }
          }
        }
      });

      res.status(201).json(campaign);
    } catch (error) {
      console.error('Error creating campaign:', error);
      res.status(500).json({ 
        message: 'Error creating campaign', 
        error: (error as Error).message 
      });
    }
  }

  // Listar todas as campanhas
  async getAllCampaigns(req: Request, res: Response) {
    try {
      const campaigns = await prisma.campaign.findMany({
        include: {
          plan: {
            include: {
              permissionGroup: true
            }
          },
          _count: {
            select: {
              subscriptions: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      // Verificar e atualizar status de campanhas expiradas
      const now = new Date();
      const campaignsToUpdate = campaigns
        .filter(campaign => campaign.isActive && campaign.endDate < now)
        .map(campaign => campaign.id);

      if (campaignsToUpdate.length > 0) {
        await prisma.campaign.updateMany({
          where: { id: { in: campaignsToUpdate } },
          data: { isActive: false }
        });
      }

      // Recarregar campanhas após atualização
      const updatedCampaigns = await prisma.campaign.findMany({
        include: {
          plan: {
            include: {
              permissionGroup: true
            }
          },
          _count: {
            select: {
              subscriptions: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      res.status(200).json(updatedCampaigns);
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      res.status(500).json({ 
        message: 'Error fetching campaigns', 
        error: (error as Error).message 
      });
    }
  }

  // Buscar campanha por ID
  async getCampaignById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          plan: {
            include: {
              permissionGroup: true
            }
          },
          _count: {
            select: {
              subscriptions: true
            }
          }
        }
      });

      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Verificar se a campanha expirou e atualizar status
      if (campaign.isActive && campaign.endDate < new Date()) {
        await prisma.campaign.update({
          where: { id },
          data: { isActive: false }
        });
        campaign.isActive = false;
      }

      res.status(200).json(campaign);
    } catch (error) {
      console.error('Error fetching campaign:', error);
      res.status(500).json({ 
        message: 'Error fetching campaign', 
        error: (error as Error).message 
      });
    }
  }

  // Atualizar campanha
  async updateCampaign(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, planId, startDate, endDate, isActive } = req.body;

      const currentCampaign = await prisma.campaign.findUnique({
        where: { id }
      });

      if (!currentCampaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Se está mudando o plano, validar
      if (planId && planId !== currentCampaign.planId) {
        const plan = await prisma.plan.findUnique({
          where: { id: planId }
        });

        if (!plan) {
          return res.status(404).json({ message: 'Plan not found' });
        }

        if (!plan.isCampaign) {
          return res.status(400).json({ 
            message: 'The selected plan is not configured for campaigns' 
          });
        }
      }

      // Validar datas
      const now = new Date();
      let startDateTime = currentCampaign.startDate;
      let endDateTime = currentCampaign.endDate;

      if (startDate !== undefined) {
        startDateTime = startDate ? new Date(startDate) : null;
      }

      if (endDate) {
        endDateTime = new Date(endDate);
        if (endDateTime <= now) {
          return res.status(400).json({ 
            message: 'The campaign end date must be in the future' 
          });
        }
      }

      if (startDateTime && endDateTime && endDateTime <= startDateTime) {
        return res.status(400).json({ 
          message: 'The campaign end date must be after the start date' 
        });
      }

      const updatedCampaign = await prisma.campaign.update({
        where: { id },
        data: {
          name: name || currentCampaign.name,
          description: description !== undefined ? description : currentCampaign.description,
          planId: planId || currentCampaign.planId,
          startDate: startDateTime,
          endDate: endDateTime,
          isActive: isActive !== undefined ? isActive : currentCampaign.isActive
        },
        include: {
          plan: {
            include: {
              permissionGroup: true
            }
          },
          _count: {
            select: {
              subscriptions: true
            }
          }
        }
      });

      res.status(200).json(updatedCampaign);
    } catch (error) {
      console.error('Error updating campaign:', error);
      res.status(500).json({ 
        message: 'Error updating campaign', 
        error: (error as Error).message 
      });
    }
  }

  // Deletar campanha
  async deleteCampaign(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Verificar se a campanha existe
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              subscriptions: true
            }
          }
        }
      });

      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Verificar se há assinaturas associadas
      if (campaign._count.subscriptions > 0) {
        return res.status(400).json({ 
          message: `Cannot delete campaign with ${campaign._count.subscriptions} associated subscription(s). Please deactivate it instead.` 
        });
      }

      await prisma.campaign.delete({
        where: { id }
      });

      res.status(200).json({ message: 'Campaign deleted successfully' });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      res.status(500).json({ 
        message: 'Error deleting campaign', 
        error: (error as Error).message 
      });
    }
  }

  // Listar planos disponíveis para campanhas
  async getCampaignPlans(req: Request, res: Response) {
    try {
      const campaignPlans = await prisma.plan.findMany({
        where: {
          isCampaign: true
        },
        include: {
          permissionGroup: true
        },
        orderBy: {
          name: 'asc'
        }
      });

      const formattedPlans = campaignPlans.map(plan => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        price: plan.price?.toNumber() || null,
        features: plan.features,
        validityType: plan.validityType,
        validityDuration: plan.validityDuration,
        permissionGroupId: plan.permissionGroupId,
        permissionGroup: plan.permissionGroup,
        allowedEmployees: plan.allowedEmployees,
        isCampaign: plan.isCampaign
      }));

      res.status(200).json(formattedPlans);
    } catch (error) {
      console.error('Error fetching campaign plans:', error);
      res.status(500).json({ 
        message: 'Error fetching campaign plans', 
        error: (error as Error).message 
      });
    }
  }

  // Buscar clientes de uma campanha específica
  async getCampaignClients(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      // Verificar se a campanha existe
      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          plan: true
        }
      });

      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Buscar todas as subscriptions da campanha com dados da empresa e usuário
      const subscriptions = await prisma.subscription.findMany({
        where: {
          campaignId: id
        },
        include: {
          company: {
            include: {
              User: {
                where: {
                  office: {
                    name: 'Owner'
                  }
                },
                take: 1
              }
            }
          }
        },
        orderBy: {
          startDate: 'desc'
        }
      });

      // Formatar resposta no mesmo formato que a listagem de empresas
      const formattedClients = subscriptions.map(subscription => ({
        id: subscription.company.id,
        name: subscription.company.name,
        avatar: subscription.company.avatar,
        extraEmployees: subscription.company.extraEmployees,
        subscriptionDate: subscription.startDate,
        User: subscription.company.User[0] || null
      }));

      res.status(200).json({
        campaign: {
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          isActive: campaign.isActive,
          plan: campaign.plan
        },
        clients: formattedClients
      });
    } catch (error) {
      console.error('Error fetching campaign clients:', error);
      res.status(500).json({ 
        message: 'Error fetching campaign clients', 
        error: (error as Error).message 
      });
    }
  }
}

