import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesActivityController {
  // Criar atividade ou comentário
  async create(req: Request, res: Response) {
    try {
      const { dealId: paramDealId } = req.params;
      const { dealId: bodyDealId, type, description, metadata, userId, content } = req.body;
      const currentUserId = (req as any).user?.id;

      // Suportar tanto /activities quanto /comments endpoint
      const finalDealId = paramDealId || bodyDealId;
      const activityType = type || 'comment';
      const activityDescription = description || content;

      if (!finalDealId) {
        return res.status(400).json({ 
          error: "dealId is required" 
        });
      }

      if (!activityDescription || !activityDescription.trim()) {
        return res.status(400).json({ 
          error: "Description or content is required" 
        });
      }

      const activity = await prisma.salesActivity.create({
        data: {
          dealId: finalDealId,
          type: activityType,
          description: activityDescription.trim(),
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
          userId: userId || currentUserId || null
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true
            }
          },
          deal: {
            select: {
              id: true,
              title: true
            }
          }
        }
      });

      // Gerar URL pré-assinada para avatar
      if (activity.user?.avatar) {
        const { getPresignedUrl } = await import('../../utils/S3/getPresignedUrl');
        activity.user.avatar = await getPresignedUrl(activity.user.avatar);
      }

      return res.status(201).json(activity);
    } catch (error: any) {
      // console.error("Error creating activity:", error);
      return res.status(500).json({ 
        error: "Erro ao criar atividade",
        message: error.message 
      });
    }
  }

  // Listar atividades de um deal
  async getByDeal(req: Request, res: Response) {
    try {
      const { dealId } = req.params;

      const activities = await prisma.salesActivity.findMany({
        where: { dealId },
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
      });

      // Gerar URLs pré-assinadas para avatares
      const { getPresignedUrl } = await import('../../utils/S3/getPresignedUrl');
      for (const activity of activities) {
        if (activity.user?.avatar) {
          activity.user.avatar = await getPresignedUrl(activity.user.avatar);
        }
      }

      return res.status(200).json(activities);
    } catch (error: any) {
      // console.error("Error getting activities:", error);
      return res.status(500).json({ 
        error: "Erro ao buscar atividades",
        message: error.message 
      });
    }
  }

  // Deletar atividade
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.salesActivity.delete({
        where: { id }
      });

      return res.status(200).json({ message: "Atividade deletada com sucesso" });
    } catch (error: any) {
      // console.error("Error deleting activity:", error);
      return res.status(500).json({ 
        error: "Erro ao deletar atividade",
        message: error.message 
      });
    }
  }
}

