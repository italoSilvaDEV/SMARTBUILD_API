import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesDealController {
  // Criar novo deal
  async create(req: Request, res: Response) {
    try {
      const {
        title,
        estimatedValue,
        companyId,
        pipelineId,
        stageId,
        assignedToId,
        notes,
        contactName,
        contactEmail,
        contactPhone,
        expectedCloseDate
      } = req.body;

      if (!title || !pipelineId || !stageId) {
        return res.status(400).json({ 
          error: "Título, pipelineId e stageId são obrigatórios" 
        });
      }

      // Verificar se stage pertence ao pipeline
      const stage = await prisma.salesStage.findUnique({
        where: { id: stageId },
        include: { pipeline: true }
      });

      if (!stage || stage.pipelineId !== pipelineId) {
        return res.status(400).json({ 
          error: "Stage não pertence ao pipeline especificado" 
        });
      }

      const deal = await prisma.salesDeal.create({
        data: {
          title,
          estimatedValue: estimatedValue ? parseFloat(estimatedValue) : null,
          companyId,
          pipelineId,
          stageId,
          assignedToId,
          notes,
          contactName,
          contactEmail,
          contactPhone,
          expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : null
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          },
          stage: true,
          pipeline: true
        }
      });

      // Criar atividade de criação
      await prisma.salesActivity.create({
        data: {
          dealId: deal.id,
          type: "note",
          description: `Deal criado no estágio "${stage.name}"`,
          userId: assignedToId || undefined
        }
      });

      return res.status(201).json(deal);
    } catch (error: any) {
      console.error("Error creating deal:", error);
      return res.status(500).json({ 
        error: "Erro ao criar deal",
        message: error.message 
      });
    }
  }

  // Atualizar deal
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        title,
        estimatedValue,
        companyId,
        stageId,
        assignedToId,
        notes,
        contactName,
        contactEmail,
        contactPhone,
        expectedCloseDate
      } = req.body;

      const deal = await prisma.salesDeal.findUnique({
        where: { id },
        include: { stage: true }
      });

      if (!deal) {
        return res.status(404).json({ error: "Deal não encontrado" });
      }

      // Se mudou de stage, criar atividade
      let activityDescription = null;
      if (stageId && stageId !== deal.stageId) {
        const newStage = await prisma.salesStage.findUnique({
          where: { id: stageId }
        });
        if (newStage) {
          activityDescription = `Movido de "${deal.stage.name}" para "${newStage.name}"`;
        }
      }

      const updatedDeal = await prisma.salesDeal.update({
        where: { id },
        data: {
          title,
          estimatedValue: estimatedValue !== undefined ? parseFloat(estimatedValue) : undefined,
          companyId,
          stageId,
          assignedToId,
          notes,
          contactName,
          contactEmail,
          contactPhone,
          expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          },
          stage: true,
          pipeline: true
        }
      });

      // Criar atividade se mudou de stage
      if (activityDescription) {
        await prisma.salesActivity.create({
          data: {
            dealId: id,
            type: "stage_change",
            description: activityDescription,
            userId: assignedToId || undefined
          }
        });
      }

      return res.status(200).json(updatedDeal);
    } catch (error: any) {
      console.error("Error updating deal:", error);
      return res.status(500).json({ 
        error: "Erro ao atualizar deal",
        message: error.message 
      });
    }
  }

  // Mover deal para outro stage (usado pelo Kanban)
  async moveStage(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { stageId, userId } = req.body;

      if (!stageId) {
        return res.status(400).json({ error: "stageId é obrigatório" });
      }

      const deal = await prisma.salesDeal.findUnique({
        where: { id },
        include: { 
          stage: true,
          pipeline: true
        }
      });

      if (!deal) {
        return res.status(404).json({ error: "Deal não encontrado" });
      }

      // Verificar se stage pertence ao mesmo pipeline
      const newStage = await prisma.salesStage.findUnique({
        where: { id: stageId }
      });

      if (!newStage || newStage.pipelineId !== deal.pipelineId) {
        return res.status(400).json({ 
          error: "Stage não pertence ao pipeline do deal" 
        });
      }

      const updatedDeal = await prisma.salesDeal.update({
        where: { id },
        data: { stageId },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          },
          stage: true,
          pipeline: true
        }
      });

      // Criar atividade de mudança de stage
      await prisma.salesActivity.create({
        data: {
          dealId: id,
          type: "stage_change",
          description: `Movido de "${deal.stage.name}" para "${newStage.name}"`,
          userId: userId || deal.assignedToId || undefined
        }
      });

      // Se moveu para "Assinante", marcar como convertido
      if ((newStage.name.toLowerCase().includes("assinante") || newStage.name.toLowerCase().includes("convertido")) && !deal.isConverted) {
        await prisma.salesDeal.update({
          where: { id },
          data: {
            isConverted: true,
            actualCloseDate: new Date(),
            convertedAt: new Date()
          }
        });
      }

      return res.status(200).json(updatedDeal);
    } catch (error: any) {
      console.error("Error moving deal stage:", error);
      return res.status(500).json({ 
        error: "Erro ao mover deal",
        message: error.message 
      });
    }
  }

  // Converter deal em cliente ativo (criar subscription)
  async convert(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { planId } = req.body;

      const deal = await prisma.salesDeal.findUnique({
        where: { id },
        include: {
          company: true,
          assignedTo: true
        }
      });

      if (!deal) {
        return res.status(404).json({ error: "Deal não encontrado" });
      }

      if (deal.isConverted) {
        return res.status(400).json({ error: "Deal já foi convertido" });
      }

      if (!deal.companyId) {
        return res.status(400).json({ 
          error: "Deal precisa estar associado a uma empresa para ser convertido" 
        });
      }

      if (!planId) {
        return res.status(400).json({ error: "planId é obrigatório" });
      }

      // Buscar plano
      const plan = await prisma.plan.findUnique({
        where: { id: planId }
      });

      if (!plan) {
        return res.status(404).json({ error: "Plano não encontrado" });
      }

      // Calcular datas da subscription
      const startDate = new Date();
      let endDate = new Date();

      if (plan.validityType === 'FREE') {
        endDate.setDate(endDate.getDate() + plan.validityDuration);
      } else if (plan.validityType === 'MONTHLY') {
        endDate.setMonth(endDate.getMonth() + plan.validityDuration);
      } else if (plan.validityType === 'ANNUAL') {
        endDate.setFullYear(endDate.getFullYear() + plan.validityDuration);
      }

      // Criar subscription
      const subscription = await prisma.subscription.create({
        data: {
          companyId: deal.companyId,
          planId: planId,
          startDate,
          endDate,
          isActive: true
        }
      });

      // Atualizar company com planId
      await prisma.company.update({
        where: { id: deal.companyId },
        data: { planId }
      });

      // Marcar deal como convertido
      const updatedDeal = await prisma.salesDeal.update({
        where: { id },
        data: {
          isConverted: true,
          actualCloseDate: new Date(),
          convertedAt: new Date()
        },
        include: {
          company: true,
          assignedTo: true,
          stage: true,
          pipeline: true
        }
      });

      // Criar atividade
      await prisma.salesActivity.create({
        data: {
          dealId: id,
          type: "note",
          description: `Deal convertido em cliente ativo. Plano: ${plan.name}`,
          userId: deal.assignedToId || undefined
        }
      });

      return res.status(200).json({
        deal: updatedDeal,
        subscription
      });
    } catch (error: any) {
      console.error("Error converting deal:", error);
      return res.status(500).json({ 
        error: "Erro ao converter deal",
        message: error.message 
      });
    }
  }

  // Deletar deal
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.salesDeal.delete({
        where: { id }
      });

      return res.status(200).json({ message: "Deal deletado com sucesso" });
    } catch (error: any) {
      console.error("Error deleting deal:", error);
      return res.status(500).json({ 
        error: "Erro ao deletar deal",
        message: error.message 
      });
    }
  }

  // Obter deal por ID com atividades
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deal = await prisma.salesDeal.findUnique({
        where: { id },
        include: {
          company: {
            include: {
              User: {
                where: {
                  office: {
                    name: "Administrator"
                  }
                },
                take: 1
              }
            }
          },
          assignedTo: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true
            }
          },
          stage: true,
          pipeline: true,
          activities: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  avatar: true
                }
              }
            },
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!deal) {
        return res.status(404).json({ error: "Deal não encontrado" });
      }

      return res.status(200).json(deal);
    } catch (error: any) {
      console.error("Error getting deal:", error);
      return res.status(500).json({ 
        error: "Erro ao buscar deal",
        message: error.message 
      });
    }
  }
}

