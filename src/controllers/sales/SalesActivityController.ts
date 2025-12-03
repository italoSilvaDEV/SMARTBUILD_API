import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesActivityController {
  // Criar atividade
  async create(req: Request, res: Response) {
    try {
      const { dealId, type, description, metadata, userId } = req.body;

      if (!dealId || !type) {
        return res.status(400).json({ 
          error: "dealId e type são obrigatórios" 
        });
      }

      const activity = await prisma.salesActivity.create({
        data: {
          dealId,
          type,
          description,
          metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
          userId
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

      return res.status(201).json(activity);
    } catch (error: any) {
      console.error("Error creating activity:", error);
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

      return res.status(200).json(activities);
    } catch (error: any) {
      console.error("Error getting activities:", error);
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
      console.error("Error deleting activity:", error);
      return res.status(500).json({ 
        error: "Erro ao deletar atividade",
        message: error.message 
      });
    }
  }
}

