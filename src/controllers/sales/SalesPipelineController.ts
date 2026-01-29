import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesPipelineController {
  // Criar pipeline padrão com estágios iniciais
  async createDefaultPipeline(req: Request, res: Response) {
    try {
      // Verificar se já existe pipeline padrão
      const existingDefault = await prisma.salesPipeline.findFirst({
        where: { isDefault: true }
      });

      if (existingDefault) {
        return res.status(400).json({ 
          error: "Já existe um pipeline padrão. Use o endpoint de atualização." 
        });
      }

      const defaultStages = [
        { name: "Leads", position: 0, color: "#E2A300" },
        { name: "Free Trial", position: 1, color: "#4C6EF5" },
        { name: "Inactive", position: 2, color: "#6C7B7F" },
        { name: "Paid", position: 3, color: "#079455" },
        { name: "Lost", position: 4, color: "#D92D20" }
      ];

      const pipeline = await prisma.salesPipeline.create({
        data: {
          name: "Sales Pipeline",
          description: "Pipeline padrão de vendas",
          isDefault: true,
          isActive: true,
          stages: {
            create: defaultStages
          }
        },
        include: {
          stages: {
            orderBy: { position: 'asc' }
          }
        }
      });

      return res.status(201).json(pipeline);
    } catch (error: any) {
      // console.error("Error creating default pipeline:", error);
      return res.status(500).json({ 
        error: "Erro ao criar pipeline padrão",
        message: error.message 
      });
    }
  }

  // Listar todos os pipelines
  async list(req: Request, res: Response) {
    try {
      const pipelines = await prisma.salesPipeline.findMany({
        where: { isActive: true },
        include: {
          stages: {
            orderBy: { position: 'asc' }
          },
          _count: {
            select: { deals: true }
          }
        },
        orderBy: [
          { isDefault: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      return res.status(200).json(pipelines);
    } catch (error: any) {
      // console.error("Error listing pipelines:", error);
      return res.status(500).json({ 
        error: "Erro ao listar pipelines",
        message: error.message 
      });
    }
  }

  // Obter pipeline por ID com deals
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { assignedToId, stageId } = req.query;

      const whereClause: any = { pipelineId: id };
      if (assignedToId) whereClause.assignedToId = assignedToId;
      if (stageId) whereClause.stageId = stageId;

      const pipeline = await prisma.salesPipeline.findUnique({
        where: { id },
        include: {
          stages: {
            orderBy: { position: 'asc' },
            include: {
              deals: {
                where: whereClause,
                include: {
                  company: {
                    select: {
                      id: true,
                      name: true,
                      avatar: true,
                      address: true,
                      phone: true,
                      email: true,
                      date_creation: true,
                      Subscription: {
                        select: {
                          plan: {
                            select: {
                              name: true,
                              price: true,
                              validityType: true
                            }
                          },
                          startDate: true,
                          endDate: true
                        }
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
                  _count: {
                    select: { activities: true }
                  }
                },
                orderBy: { position: 'asc' }
              }
            }
          }
        }
      });

      if (!pipeline) {
        return res.status(404).json({ error: "Pipeline não encontrado" });
      }

      // Adicionar URL pré-assinada para avatares dos deals
      const { getPresignedUrl } = await import('../../utils/S3/getPresignedUrl');
      
      for (const stage of pipeline.stages) {
        for (const deal of stage.deals) {
          if (deal.company?.avatar) {
            deal.company.avatar = await getPresignedUrl(deal.company.avatar);
          }
          if (deal.assignedTo?.avatar) {
            deal.assignedTo.avatar = await getPresignedUrl(deal.assignedTo.avatar);
          }
        }
      }

      return res.status(200).json(pipeline);
    } catch (error: any) {
      // console.error("Error getting pipeline:", error);
      return res.status(500).json({ 
        error: "Erro ao buscar pipeline",
        message: error.message 
      });
    }
  }

  // Criar novo pipeline
  async create(req: Request, res: Response) {
    try {
      const { name, description, stages } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Nome do pipeline é obrigatório" });
      }

      const pipeline = await prisma.salesPipeline.create({
        data: {
          name,
          description,
          isDefault: false,
          isActive: true,
          stages: stages ? {
            create: stages.map((stage: any, index: number) => ({
              name: stage.name,
              position: stage.position ?? index,
              color: stage.color
            }))
          } : undefined
        },
        include: {
          stages: {
            orderBy: { position: 'asc' }
          }
        }
      });

      return res.status(201).json(pipeline);
    } catch (error: any) {
      // console.error("Error creating pipeline:", error);
      return res.status(500).json({ 
        error: "Erro ao criar pipeline",
        message: error.message 
      });
    }
  }

  // Atualizar pipeline
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, isActive } = req.body;

      const pipeline = await prisma.salesPipeline.update({
        where: { id },
        data: {
          name,
          description,
          isActive
        },
        include: {
          stages: {
            orderBy: { position: 'asc' }
          }
        }
      });

      return res.status(200).json(pipeline);
    } catch (error: any) {
      // console.error("Error updating pipeline:", error);
      return res.status(500).json({ 
        error: "Erro ao atualizar pipeline",
        message: error.message 
      });
    }
  }

  // Restaurar colunas padrão (criar se não existir, atualizar se existir)
  async restoreDefaultStages(req: Request, res: Response) {
    try {
      let defaultPipeline = await prisma.salesPipeline.findFirst({
        where: { isDefault: true },
        include: {
          stages: {
            orderBy: { position: 'asc' }
          }
        }
      });

      const defaultStages = [
        { name: "Leads", position: 0, color: "#E2A300" },
        { name: "Free Trial", position: 1, color: "#4C6EF5" },
        { name: "Inactive", position: 2, color: "#6C7B7F" },
        { name: "Paid", position: 3, color: "#079455" },
        { name: "Lost", position: 4, color: "#D92D20" }
      ];

      if (!defaultPipeline) {
        // Criar pipeline padrão se não existir
        defaultPipeline = await prisma.salesPipeline.create({
          data: {
            name: "Sales Pipeline",
            description: "Default sales pipeline",
            isDefault: true,
            isActive: true,
            stages: {
              create: defaultStages
            }
          },
          include: {
            stages: {
              orderBy: { position: 'asc' }
            }
          }
        });
      } else {
        // Verificar quais estágios existem e quais precisam ser criados
        const existingStages = defaultPipeline.stages;
        const existingNames = existingStages.map(s => s.name.toLowerCase());

        // Atualizar estágios existentes
        for (const defaultStage of defaultStages) {
          const existingStage = existingStages.find(s => 
            s.position === defaultStage.position
          );

          if (existingStage) {
            // Atualizar estágio existente
            await prisma.salesStage.update({
              where: { id: existingStage.id },
              data: {
                name: defaultStage.name,
                color: defaultStage.color,
                position: defaultStage.position
              }
            });
          } else {
            // Criar estágio que não existe
            await prisma.salesStage.create({
              data: {
                pipelineId: defaultPipeline.id,
                name: defaultStage.name,
                color: defaultStage.color,
                position: defaultStage.position
              }
            });
          }
        }

        // Buscar pipeline atualizado
        defaultPipeline = await prisma.salesPipeline.findUnique({
          where: { id: defaultPipeline.id },
          include: {
            stages: {
              orderBy: { position: 'asc' }
            }
          }
        });
      }

      return res.status(200).json({
        message: "Default columns restored successfully",
        pipeline: defaultPipeline
      });
    } catch (error: any) {
      // console.error("Error restoring default stages:", error);
      return res.status(500).json({
        error: "Error restoring default columns",
        message: error.message
      });
    }
  }

  // Deletar pipeline
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const pipeline = await prisma.salesPipeline.findUnique({
        where: { id },
        include: {
          _count: {
            select: { deals: true }
          }
        }
      });

      if (!pipeline) {
        return res.status(404).json({ error: "Pipeline não encontrado" });
      }

      if (pipeline.isDefault) {
        return res.status(400).json({ 
          error: "Não é possível deletar o pipeline padrão" 
        });
      }

      if (pipeline._count.deals > 0) {
        return res.status(400).json({ 
          error: "Não é possível deletar pipeline com deals associados" 
        });
      }

      await prisma.salesPipeline.delete({
        where: { id }
      });

      return res.status(200).json({ message: "Pipeline deletado com sucesso" });
    } catch (error: any) {
      // console.error("Error deleting pipeline:", error);
      return res.status(500).json({ 
        error: "Erro ao deletar pipeline",
        message: error.message 
      });
    }
  }
}

