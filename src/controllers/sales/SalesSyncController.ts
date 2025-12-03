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

      // Buscar estágios de forma flexível (pode ter nomes diferentes)
      const leadStage = defaultPipeline.stages.find(s => 
        s.name.toLowerCase().includes("lead") || 
        s.name.toLowerCase().includes("prospect")
      ) || defaultPipeline.stages.sort((a, b) => a.position - b.position)[0]; // Fallback para primeiro estágio
      
      const freeTrialStage = defaultPipeline.stages.find(s => 
        s.name.toLowerCase().includes("free trial") && 
        !s.name.toLowerCase().includes("inactive")
      );
      
      const inactiveStage = defaultPipeline.stages.find(s => 
        s.name.toLowerCase().includes("inactive") ||
        s.name.toLowerCase().includes("inativos") ||
        s.name.toLowerCase().includes("free trial que acabou") ||
        s.name.toLowerCase().includes("acabou ou inativos") ||
        s.name.toLowerCase().includes("trial expir")
      );
      
      const paidStage = defaultPipeline.stages.find(s => 
        s.name.toLowerCase().includes("paid") ||
        s.name.toLowerCase().includes("pagantes") ||
        s.name.toLowerCase().includes("assinante") ||
        s.name.toLowerCase().includes("convertido") ||
        s.name.toLowerCase().includes("converted") ||
        s.name.toLowerCase().includes("vendido")
      );

      if (!leadStage) {
        return res.status(400).json({ error: "No initial stage found in pipeline" });
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

        // Verificar se é inativo (sem acesso recente)
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const lastAccess = adminUser?.last_acess;
        const isInactive = !lastAccess || new Date(lastAccess) < oneMonthAgo;

        if (activeSubscription && plan) {
          if (plan.validityType === "FREE") {
            // Verificar se o trial acabou
            const trialExpired = activeSubscription.endDate < new Date();
            
            if (trialExpired || isInactive) {
              // Trial expirado OU inativo - mover para "Inactive"
              if (inactiveStage) {
                targetStageId = inactiveStage.id;
              }
            } else {
              // Trial ativo e ativo - está em Free Trial
              if (freeTrialStage) {
                targetStageId = freeTrialStage.id;
              }
            }
          } else {
            // Se tem subscription paga, está como Paid
            if (paidStage) {
              targetStageId = paidStage.id;
              isConverted = true;
            }
          }
        } else {
          // Sem subscription - verificar se é inativo
          if (isInactive && inactiveStage) {
            targetStageId = inactiveStage.id;
          }
          // Se não é inativo e não tem subscription, fica em Leads (já definido acima)
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

