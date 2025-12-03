import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";

export class SalesSyncController {
  // Sincronizar clientes existentes como deals
  async syncCompaniesToDeals(req: Request, res: Response) {
    try {
      // Buscar pipeline padrão
      const defaultPipeline = await prisma.salesPipeline.findFirst({
        where: { isDefault: true },
        include: {
          stages: {
            orderBy: { position: 'asc' }
          }
        }
      });

      if (!defaultPipeline) {
        return res.status(404).json({ error: "Pipeline padrão não encontrado" });
      }

      // Buscar todas as companies
      const companies = await prisma.company.findMany({
        include: {
          Subscription: {
            where: { isActive: true },
            include: {
              plan: true
            },
            orderBy: { endDate: 'desc' },
            take: 1
          },
          User: {
            where: {
              office: {
                name: "Administrator"
              }
            },
            take: 1
          }
        }
      });

      const leadStage = defaultPipeline.stages.find(s => s.name === "Lead");
      const freeTrialStage = defaultPipeline.stages.find(s => s.name === "Free Trial");
      const endFreeTrialStage = defaultPipeline.stages.find(s => s.name === "End Free Trial");
      const assinanteStage = defaultPipeline.stages.find(s => s.name === "Assinante");

      if (!leadStage) {
        return res.status(400).json({ error: "Estágio 'Lead' não encontrado no pipeline" });
      }

      let created = 0;
      let updated = 0;
      let skipped = 0;

      for (const company of companies) {
        // Verificar se já existe deal para esta company
        const existingDeal = await prisma.salesDeal.findFirst({
          where: { companyId: company.id }
        });

        const adminUser = company.User && company.User.length > 0 ? company.User[0] : null;
        const activeSubscription = company.Subscription && company.Subscription.length > 0 ? company.Subscription[0] : null;
        const plan = activeSubscription?.plan;

        // Determinar estágio baseado no status da subscription
        let targetStageId = leadStage.id;
        let isConverted = false;

        if (activeSubscription && plan) {
          if (plan.validityType === "FREE") {
            // Se tem subscription FREE, está em Free Trial
            if (freeTrialStage) {
              targetStageId = freeTrialStage.id;
            }
          } else {
            // Se tem subscription paga, está como Assinante
            if (assinanteStage) {
              targetStageId = assinanteStage.id;
              isConverted = true;
            }
          }

          // Verificar se o trial acabou mas ainda não pagou
          if (plan.validityType === "FREE" && activeSubscription.endDate < new Date()) {
            if (endFreeTrialStage) {
              targetStageId = endFreeTrialStage.id;
            }
          }
        }

        if (existingDeal) {
          // Atualizar deal existente
          await prisma.salesDeal.update({
            where: { id: existingDeal.id },
            data: {
              title: company.name,
              stageId: targetStageId,
              isConverted,
              companyId: company.id,
              contactName: adminUser?.name || null,
              contactEmail: adminUser?.email || null,
              contactPhone: adminUser?.phone || null,
            }
          });
          updated++;
        } else {
          // Criar novo deal
          await prisma.salesDeal.create({
            data: {
              title: company.name,
              companyId: company.id,
              pipelineId: defaultPipeline.id,
              stageId: targetStageId,
              isConverted,
              contactName: adminUser?.name || null,
              contactEmail: adminUser?.email || null,
              contactPhone: adminUser?.phone || null,
              notes: `Cliente sincronizado automaticamente. Criado em: ${new Date(company.date_creation).toLocaleDateString('pt-BR')}`
            }
          });
          created++;
        }
      }

      return res.status(200).json({
        message: "Sincronização concluída",
        created,
        updated,
        skipped,
        total: companies.length
      });
    } catch (error: any) {
      console.error("Error syncing companies to deals:", error);
      return res.status(500).json({
        error: "Erro ao sincronizar clientes",
        message: error.message
      });
    }
  }
}

