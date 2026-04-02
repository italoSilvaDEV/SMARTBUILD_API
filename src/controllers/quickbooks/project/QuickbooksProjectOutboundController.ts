// src/controllers/quickbooks/project/QuickbooksProjectOutboundController.ts
import { Request, Response } from "express";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { QuickBooksProjectController } from "./QuickBooksProjectController";
import { mapSmartBuildProjectToQBO, mapSmartBuildProjectUpdateToQBO } from "./projectMapper";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

/**
 * Parâmetros de batch e rate limit para Projects
 *
 * - BATCH_SIZE: GraphQL não suporta batch como REST, processamos individualmente com rate limit
 * - BATCH_PAUSE_MS: 1500ms para respeitar limites da API
 * - QBO_COOLDOWN_MS: 5000ms (5s) para evitar sync loops imediatos
 * - MIN_DELTA_MS: 1000ms mínimo de diferença entre timestamps
 */

const BATCH_PAUSE_MS = 1500;
const QBO_COOLDOWN_MS = 5000;
const MIN_DELTA_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rate limiter para evitar 429 errors
 */
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: BATCH_PAUSE_MS,
});

/**
 * Controller for pushing Projects from SmartBuild to QuickBooks (Outbound)
 * Uses GraphQL API with rate limiting and cooling-off period
 */
export class QuickbooksProjectOutboundController {
  private projectController = new QuickBooksProjectController();

  /**
   * Export new projects from SmartBuild to QuickBooks
   *
   * Finds projects without idQuickbooks and creates them in QBO,
   * then updates local projects with QBO ID and timestamp.
   *
   * Step 5.2: Implement export missing projects
   */
  exportMissingProjectsToQBO = async (req: Request, res: Response) => {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    try {
      // 1. Find projects without idQuickbooks
      const projects = await prisma.project.findMany({
        where: {
          company_id: companyId,
          OR: [{ idQuickbooks: null }, { idQuickbooks: "" }],
        },
        include: {
          client: true,
        },
        orderBy: { date_creation: "asc" },
      });

      if (projects.length === 0) {
        return res.status(200).json({
          message: "Não há projetos pendentes para exportar",
          created: 0,
          errors: 0,
        });
      }

      let created = 0;
      let errors = 0;

      console.log(
        `[QuickbooksProjectOutboundController] Found ${projects.length} projects to export`
      );

      // 2. Process each project
      for (const project of projects) {
        try {
          // 3. Verify client has idQuickbooks
          if (!project.client?.idQuickbooks) {
            await createSyncLog({
              entity: "projects",
              action: "Skipped",
              entityId: project.id,
              companyId,
              details: {
                reason: "Client does not have idQuickbooks",
                clientId: project.client_id,
              },
              syncExecutionId,
            });
            errors++;
            continue;
          }

          // 4. Map project to QuickBooks format
          const qboInput = mapSmartBuildProjectToQBO(
            project,
            project.client.idQuickbooks
          );

          // 5. Create project in QBO
          const qbAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: companyId },
          });

          if (!qbAccount) {
            throw new Error("QuickBooks account not found");
          }

          const createdProject = await limiter.schedule(() =>
            this.projectController.createProject(qboInput, qbAccount.realmId)
          );

          // 6. Update local project with QBO ID and timestamp
          await prisma.project.update({
            where: { id: project.id },
            data: {
              idQuickbooks: createdProject.id,
              quickbooksUpdatedAt: new Date(
                createdProject.metaData.lastUpdatedTime
              ),
            },
          });

          await createSyncLog({
            entity: "projects",
            action: "Inserted",
            entityId: project.id,
            companyId,
            details: {
              reason: "Exported to QuickBooks",
              qbProjectId: createdProject.id,
              qbProjectName: createdProject.name,
            },
            syncExecutionId,
          });

          created++;
          console.log(
            `[QuickbooksProjectOutboundController] Created project ${project.id} in QBO as ${createdProject.id}`
          );
        } catch (error: any) {
          console.error(
            `[QuickbooksProjectOutboundController] Error exporting project ${project.id}:`,
            error
          );

          await createSyncLog({
            entity: "projects",
            action: "Error",
            entityId: project.id,
            companyId,
            details: {
              error: error?.message || String(error),
              stack: error?.stack,
            },
            syncExecutionId,
          });

          errors++;
        }
      }

      return res.status(200).json({
        message: "Exportação inicial de projetos concluída",
        created,
        errors,
      });
    } catch (error: any) {
      console.error("[QuickbooksProjectOutboundController] Export error:", error);
      return res.status(500).json({
        error: "Erro na exportação inicial de projetos",
        details: error?.message || String(error),
      });
    }
  };

  /**
   * Push updates from SmartBuild to QuickBooks
   *
   * Finds projects with idQuickbooks updated after cooling-off period
   * and updates them in QBO.
   *
   * Step 5.3: Implement push updates
   * Step 5.5: Add cooling-off period
   */
  pushProjectUpdatesToQBO = async (req: Request, res: Response) => {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    try {
      // 1. Find projects with idQuickbooks
      const projects = await prisma.project.findMany({
        where: {
          company_id: companyId,
          NOT: [{ idQuickbooks: null }, { idQuickbooks: "" }],
        },
        include: {
          client: true,
        },
        orderBy: { date_update: "desc" },
      });

      if (projects.length === 0) {
        return res.status(200).json({
          message: "Não há projetos com idQuickbooks para atualizar",
          updated: 0,
          skipped: 0,
          errors: 0,
        });
      }

      let updated = 0;
      let skipped = 0;
      let errors = 0;

      console.log(
        `[QuickbooksProjectOutboundController] Found ${projects.length} projects with idQuickbooks`
      );

      // 2. Process each project
      for (const project of projects) {
        try {
          // 3. Verify client exists and has idQuickbooks
          if (!project.client?.idQuickbooks) {
            await createSyncLog({
              entity: "projects",
              action: "Skipped",
              entityId: project.id,
              companyId,
              details: {
                reason: "Client does not exist or has no idQuickbooks",
                clientId: project.client_id,
              },
              syncExecutionId,
            });
            skipped++;
            continue;
          }

          // 4. Cooling-off period check
          const now = new Date();
          const lastRemote = project.quickbooksUpdatedAt || new Date(0);

          // Step 5.5: Only push if quickbooksUpdatedAt > 5s ago
          const stillCooling =
            project.quickbooksUpdatedAt &&
            now.getTime() - lastRemote.getTime() < QBO_COOLDOWN_MS;

          if (stillCooling) {
            await createSyncLog({
              entity: "projects",
              action: "Skipped",
              entityId: project.id,
              companyId,
              details: {
                reason: `Cooling-off (${QBO_COOLDOWN_MS}ms) after last QBO mirror`,
                lastRemote,
                now,
              },
              syncExecutionId,
            });
            skipped++;
            continue;
          }

          // 5. Delta check: Local needs to be >1s newer than remote
          const localNewer =
            project.date_update.getTime() - lastRemote.getTime() > MIN_DELTA_MS;

          if (!localNewer) {
            await createSyncLog({
              entity: "projects",
              action: "Skipped",
              entityId: project.id,
              companyId,
              details: {
                reason: "Local not newer than last QBO mirror",
                date_update: project.date_update,
                lastRemote,
                minDeltaMs: MIN_DELTA_MS,
              },
              syncExecutionId,
            });
            skipped++;
            continue;
          }

          // 6. Map project update to QuickBooks format
          const qboUpdate = mapSmartBuildProjectUpdateToQBO(project);

          // 7. Update project in QBO
          const qbAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: companyId },
          });

          if (!qbAccount) {
            throw new Error("QuickBooks account not found");
          }

          const updatedProject = await limiter.schedule(() =>
            this.projectController.updateProject(
              qboUpdate.id,
              qboUpdate.input,
              qbAccount.realmId
            )
          );

          // 8. Update quickbooksUpdatedAt timestamp
          await prisma.project.update({
            where: { id: project.id },
            data: {
              quickbooksUpdatedAt: new Date(
                updatedProject.metaData.lastUpdatedTime
              ),
            },
          });

          await createSyncLog({
            entity: "projects",
            action: "Updated",
            entityId: project.id,
            companyId,
            details: {
              reason: "Pushed update to QuickBooks",
              qbProjectId: updatedProject.id,
              qbUpdatedAt: updatedProject.metaData.lastUpdatedTime,
            },
            syncExecutionId,
          });

          updated++;
          console.log(
            `[QuickbooksProjectOutboundController] Updated project ${project.id} in QBO`
          );
        } catch (error: any) {
          console.error(
            `[QuickbooksProjectOutboundController] Error pushing project ${project.id}:`,
            error
          );

          await createSyncLog({
            entity: "projects",
            action: "Error",
            entityId: project.id,
            companyId,
            details: {
              error: error?.message || String(error),
              stack: error?.stack,
            },
            syncExecutionId,
          });

          errors++;
        }
      }

      return res.status(200).json({
        message: "Push de atualizações de projetos concluído",
        updated,
        skipped,
        errors,
      });
    } catch (error: any) {
      console.error("[QuickbooksProjectOutboundController] Push error:", error);
      return res.status(500).json({
        error: "Erro no push de atualizações de projetos",
        details: error?.message || String(error),
      });
    }
  };
}

export const quickbooksProjectOutboundController =
  new QuickbooksProjectOutboundController();
