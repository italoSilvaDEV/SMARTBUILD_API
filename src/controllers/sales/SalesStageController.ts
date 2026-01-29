import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesStageController {
  // Criar stage
  async create(req: Request, res: Response) {
    try {
      const { pipelineId, name, color } = req.body;

      if (!pipelineId || !name) {
        return res.status(400).json({ 
          error: "pipelineId e name são obrigatórios" 
        });
      }

      // Buscar a maior posição existente no pipeline
      const lastStage = await prisma.salesStage.findFirst({
        where: { pipelineId },
        orderBy: { position: 'desc' }
      });

      // Nova posição será a próxima após a última
      const newPosition = lastStage ? lastStage.position + 1 : 0;

      const stage = await prisma.salesStage.create({
        data: {
          pipelineId,
          name,
          position: newPosition,
          color: color || "#6C7B7F"
        },
        include: {
          pipeline: true
        }
      });

      return res.status(201).json(stage);
    } catch (error: any) {
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
      return res.status(500).json({ 
        error: "Erro ao deletar stage",
        message: error.message 
      });
    }
  }

  // Reordenar stages
  async reorder(req: Request, res: Response) {
    try {
      const { pipelineId, stageIds } = req.body;

      if (!pipelineId || !stageIds || !Array.isArray(stageIds)) {
        return res.status(400).json({ 
          error: "pipelineId e stageIds (array) são obrigatórios" 
        });
      }

      // Primeiro, mover todos para posições temporárias negativas para evitar conflito
      const tempUpdatePromises = stageIds.map((stageId, index) => 
        prisma.salesStage.update({
          where: { id: stageId },
          data: { position: -1000 - index } // Posições temporárias negativas
        })
      );
      await Promise.all(tempUpdatePromises);

      // Depois, atualizar para as posições finais
      const finalUpdatePromises = stageIds.map((stageId, index) => 
        prisma.salesStage.update({
          where: { id: stageId },
          data: { position: index }
        })
      );
      await Promise.all(finalUpdatePromises);

      return res.status(200).json({ message: "Stages reordenados com sucesso" });
    } catch (error: any) {
      return res.status(500).json({ 
        error: "Erro ao reordenar stages",
        message: error.message 
      });
    }
  }
}

