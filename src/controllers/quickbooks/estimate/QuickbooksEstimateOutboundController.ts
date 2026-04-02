// src/controllers/quickbooks/estimate/QuickbooksEstimateOutboundController.ts
import { Request, Response } from "express";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { QuickBooksEstimateController } from "./QuickBooksEstimateController";
import {
  mapSmartBuildEstimateToQBO,
  mapSmartBuildEstimateUpdateToQBO,
} from "./estimateMapper";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

/**
 * Shape of QuickBooks Estimate from REST API
 */
interface QBEstimate {
  Id: string;
  DocNumber?: string | null;
  TotalAmt: string;
  Description?: string | null;
  TermsRef?: {
    value?: string | null;
    name?: string | null;
  } | null;
  Status?: string | null;
  CustomerRef?: {
    value: string;
    name?: string;
  } | null;
  ProjectRef?: {
    value: string;
    name?: string;
  } | null;
  Line?: QBEstimateLine[];
  MetaData?: {
    CreateTime: string;
    LastUpdatedTime: string;
  };
}

/**
 * Shape of QuickBooks Estimate Line from REST API
 */
interface QBEstimateLine {
  Id: string;
  Description?: string | null;
  Amount: string;
  Qty?: number | null;
}

/**
 * Parâmetros de batch e rate limit para Estimates
 *
 * - BATCH_PAUSE_MS: 1500ms para respeitar limites da API REST
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
 * Controller for pushing Estimates from SmartBuild to QuickBooks (Outbound)
 * Uses REST v3 API with rate limiting and cooling-off period
 */
export class QuickbooksEstimateOutboundController {
  private estimateController = new QuickBooksEstimateController();

  /**
   * Export new estimates from SmartBuild to QuickBooks
   *
   * Finds estimates without idQuickbooks and creates them in QBO,
   * then updates local estimates with QBO ID and timestamp.
   * Maps returned QBO line IDs to EstimateServiceProject.idQuickbooksLine.
   *
   * Step 8.2: Implement export missing estimates
   */
  exportMissingEstimatesToQBO = async (req: Request, res: Response) => {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    try {
      // 1. Find estimates without idQuickbooks
      const estimates = await prisma.estimate.findMany({
        where: {
          projectId: {
            not: undefined,
          },
          OR: [{ idQuickbooks: null }, { idQuickbooks: "" }],
        },
        include: {
          serviceProjects: true,
          project: {
            include: {
              client: true,
            },
          },
        },
        orderBy: { date_creation: "asc" },
      });

      if (estimates.length === 0) {
        return res.status(200).json({
          message: "Não há orçamentos pendentes para exportar",
          created: 0,
          errors: 0,
        });
      }

      let created = 0;
      let errors = 0;

      console.log(
        `[QuickbooksEstimateOutboundController] Found ${estimates.length} estimates to export`
      );

      // 2. Process each estimate
      for (const estimate of estimates) {
        try {
          // 3. Verify project client has idQuickbooks
          if (!estimate.project?.client?.idQuickbooks) {
            await createSyncLog({
              entity: "estimates",
              action: "Skipped",
              entityId: estimate.id,
              companyId,
              details: {
                reason: "Project client does not have idQuickbooks",
                projectId: estimate.projectId,
                clientId: estimate.project?.client_id,
              },
              syncExecutionId,
            });
            errors++;
            continue;
          }

          // 4. Check if project has idQuickbooks for ProjectRef
          const qboProjectId = estimate.project?.idQuickbooks || undefined;

          // 5. Map estimate to QuickBooks format
          const qboInput = mapSmartBuildEstimateToQBO(
            estimate,
            estimate.project.client.idQuickbooks,
            qboProjectId
          );

          // 6. Create estimate in QBO
          const qbAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: companyId },
          });

          if (!qbAccount) {
            throw new Error("QuickBooks account not found");
          }

          const createdEstimate = await limiter.schedule(() =>
            this.estimateController.createEstimate(
              qboInput,
              qbAccount.realmId
            )
          );

          // 7. Update local estimate with QBO ID and timestamp
          await prisma.estimate.update({
            where: { id: estimate.id },
            data: {
              idQuickbooks: createdEstimate.Id,
              quickbooksUpdatedAt: createdEstimate.MetaData
                ? new Date(createdEstimate.MetaData.LastUpdatedTime)
                : new Date(),
            },
          });

          // 8. Map returned QBO line IDs to EstimateServiceProject.idQuickbooksLine
          if (
            createdEstimate.Line &&
            createdEstimate.Line.length > 0 &&
            estimate.serviceProjects &&
            estimate.serviceProjects.length > 0
          ) {
            for (let i = 0; i < createdEstimate.Line.length; i++) {
              const qbLine = createdEstimate.Line[i];
              const sbLine = estimate.serviceProjects[i];

              if (sbLine) {
                await prisma.estimateServiceProject.update({
                  where: { id: sbLine.id },
                  data: {
                    idQuickbooksLine: qbLine.Id,
                  },
                });
              }
            }
          }

          await createSyncLog({
            entity: "estimates",
            action: "Inserted",
            entityId: estimate.id,
            companyId,
            details: {
              reason: "Exported to QuickBooks",
              qbEstimateId: createdEstimate.Id,
              qbEstimateNumber: createdEstimate.DocNumber,
              linesCount: createdEstimate.Line?.length || 0,
            },
            syncExecutionId,
          });

          created++;
          console.log(
            `[QuickbooksEstimateOutboundController] Created estimate ${estimate.id} in QBO as ${createdEstimate.Id}`
          );
        } catch (error: any) {
          console.error(
            `[QuickbooksEstimateOutboundController] Error exporting estimate ${estimate.id}:`,
            error
          );

          await createSyncLog({
            entity: "estimates",
            action: "Error",
            entityId: estimate.id,
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
        message: "Exportação inicial de orçamentos concluída",
        created,
        errors,
      });
    } catch (error: any) {
      console.error(
        "[QuickbooksEstimateOutboundController] Export error:",
        error
      );
      return res.status(500).json({
        error: "Erro na exportação inicial de orçamentos",
        details: error?.message || String(error),
      });
    }
  };

  /**
   * Push updates from SmartBuild to QuickBooks
   *
   * Finds estimates with idQuickbooks updated after cooling-off period
   * and updates them in QBO.
   *
   * Step 8.3: Implement push updates
   */
  pushEstimateUpdatesToQBO = async (req: Request, res: Response) => {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    try {
      // 1. Find estimates with idQuickbooks
      const estimates = await prisma.estimate.findMany({
        where: {
          NOT: [{ idQuickbooks: null }, { idQuickbooks: "" }],
        },
        include: {
          serviceProjects: true,
          project: {
            include: {
              client: true,
            },
          },
        },
        orderBy: { date_update: "desc" },
      });

      if (estimates.length === 0) {
        return res.status(200).json({
          message: "Não há orçamentos com idQuickbooks para atualizar",
          updated: 0,
          skipped: 0,
          errors: 0,
        });
      }

      let updated = 0;
      let skipped = 0;
      let errors = 0;

      console.log(
        `[QuickbooksEstimateOutboundController] Found ${estimates.length} estimates with idQuickbooks`
      );

      // 2. Process each estimate
      for (const estimate of estimates) {
        try {
          // 3. Verify project client exists and has idQuickbooks
          if (!estimate.project?.client?.idQuickbooks) {
            await createSyncLog({
              entity: "estimates",
              action: "Skipped",
              entityId: estimate.id,
              companyId,
              details: {
                reason: "Project client does not exist or has no idQuickbooks",
                projectId: estimate.projectId,
                clientId: estimate.project?.client_id,
              },
              syncExecutionId,
            });
            skipped++;
            continue;
          }

          // 4. Cooling-off period check
          const now = new Date();
          const lastRemote = estimate.quickbooksUpdatedAt || new Date(0);

          // Only push if quickbooksUpdatedAt > 5s ago
          const stillCooling =
            estimate.quickbooksUpdatedAt &&
            now.getTime() - lastRemote.getTime() < QBO_COOLDOWN_MS;

          if (stillCooling) {
            await createSyncLog({
              entity: "estimates",
              action: "Skipped",
              entityId: estimate.id,
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
            estimate.date_update.getTime() - lastRemote.getTime() > MIN_DELTA_MS;

          if (!localNewer) {
            await createSyncLog({
              entity: "estimates",
              action: "Skipped",
              entityId: estimate.id,
              companyId,
              details: {
                reason: "Local not newer than last QBO mirror",
                date_update: estimate.date_update,
                lastRemote,
                minDeltaMs: MIN_DELTA_MS,
              },
              syncExecutionId,
            });
            skipped++;
            continue;
          }

          // 6. Map estimate update to QuickBooks format
          const qboUpdate = mapSmartBuildEstimateUpdateToQBO(estimate);

          // 7. Update estimate in QBO
          const qbAccount = await prisma.quickBooksAccount.findFirst({
            where: { company_id: companyId },
          });

          if (!qbAccount) {
            throw new Error("QuickBooks account not found");
          }

          const updatedEstimate = await limiter.schedule(() =>
            this.estimateController.updateEstimate(
              qboUpdate.Id,
              qboUpdate,
              qbAccount.realmId
            )
          );

          // 8. Update quickbooksUpdatedAt timestamp
          await prisma.estimate.update({
            where: { id: estimate.id },
            data: {
              quickbooksUpdatedAt: updatedEstimate.MetaData
                ? new Date(updatedEstimate.MetaData.LastUpdatedTime)
                : new Date(),
            },
          });

          await createSyncLog({
            entity: "estimates",
            action: "Updated",
            entityId: estimate.id,
            companyId,
            details: {
              reason: "Pushed update to QuickBooks",
              qbEstimateId: updatedEstimate.Id,
              qbUpdatedAt: updatedEstimate.MetaData
                ? updatedEstimate.MetaData.LastUpdatedTime
                : undefined,
            },
            syncExecutionId,
          });

          updated++;
          console.log(
            `[QuickbooksEstimateOutboundController] Updated estimate ${estimate.id} in QBO`
          );
        } catch (error: any) {
          console.error(
            `[QuickbooksEstimateOutboundController] Error pushing estimate ${estimate.id}:`,
            error
          );

          await createSyncLog({
            entity: "estimates",
            action: "Error",
            entityId: estimate.id,
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
        message: "Push de atualizações de orçamentos concluído",
        updated,
        skipped,
        errors,
      });
    } catch (error: any) {
      console.error("[QuickbooksEstimateOutboundController] Push error:", error);
      return res.status(500).json({
        error: "Erro no push de atualizações de orçamentos",
        details: error?.message || String(error),
      });
    }
  };
}

export const quickbooksEstimateOutboundController =
  new QuickbooksEstimateOutboundController();
