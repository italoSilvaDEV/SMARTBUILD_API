import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesStageController {
  // Criar stage
  async create(req: Request, res: Response) {
    try {
      const { pipelineId, name, position, color } = req.body;

      if (!pipelineId || !name) {
        return res.status(400).json({ 
          error: "pipelineId e name são obrigatórios" 
        });
      }

      const stage = await prisma.salesStage.create({
        data: {
          pipelineId,
          name,
          position: position ?? 0,
          color: color || "#6C7B7F"
        },
        include: {
          pipeline: true
        }
      });

      return res.status(201).json(stage);
    } catch (error: any) {
      console.error("Error creating stage:", error);
      return res.status(500).json({ 
        error: "Erro ao criar stage",
        message: error.message 
      });
    }
  }

  // Atualizar stage
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, position, color } = req.body;

      const stage = await prisma.salesStage.update({
        where: { id },
        data: {
          name,
          position,
          color
        },
        include: {
          pipeline: true
        }
      });

      return res.status(200).json(stage);
    } catch (error: any) {
      console.error("Error updating stage:", error);
      return res.status(500).json({ 
        error: "Erro ao atualizar stage",
        message: error.message 
      });
    }
  }

  // Deletar stage
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const stage = await prisma.salesStage.findUnique({
        where: { id },
        include: {
          _count: {
            select: { deals: true }
          }
        }
      });

      if (!stage) {
        return res.status(404).json({ error: "Stage não encontrado" });
      }

      if (stage._count.deals > 0) {
        return res.status(400).json({ 
          error: "Não é possível deletar stage com deals associados" 
        });
      }

      await prisma.salesStage.delete({
        where: { id }
      });

      return res.status(200).json({ message: "Stage deletado com sucesso" });
    } catch (error: any) {
      console.error("Error deleting stage:", error);
      return res.status(500).json({ 
        error: "Erro ao deletar stage",
        message: error.message 
      });
    }
  }
}

