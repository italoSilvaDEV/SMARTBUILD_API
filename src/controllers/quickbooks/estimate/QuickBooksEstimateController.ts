// src/controllers/quickbooks/estimate/QuickBooksEstimateController.ts
import { prisma } from "../../../utils/prisma";
import { getQbClientOrThrow } from "../util/QuickBooksClientUtil";
import { Request, Response } from "express";
import Bottleneck from "bottleneck";
import { mapQBOEstimateToSmartBuild, mapQBOEstimateLineToSBServiceProject } from "./estimateMapper";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

/**
 * Rate limiter for QuickBooks REST API to avoid 429 errors
 * Limits to 1 request per 1100ms (within QuickBooks API limits)
 */
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100,
});

/**
 * Shape of QuickBooks Estimate from REST API
 */
interface QBEstimate {
  Id: string;
  DocNumber?: string | null;
  TotalAmt: string; // Decimal as string
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
  Amount: string; // Decimal as string
  Qty?: number | null;
}

/**
 * Controller for QuickBooks Estimates API operations
 * Uses REST v3 API with rate limiting and error handling
 */
export class QuickBooksEstimateController {
  /**
   * Create a new Estimate in QuickBooks
   *
   * @param estimateData - Estimate data to create
   * @param realmId - QuickBooks realm ID
   * @returns Created estimate from QuickBooks
   */
  async createEstimate(
    estimateData: any,
    realmId: string
  ): Promise<QBEstimate> {
    return new Promise((resolve, reject) => {
      const qb = (global as any).qbClient;

      if (!qb) {
        reject(new Error("QuickBooks client not initialized"));
        return;
      }

      qb.createEstimate(estimateData, (err: any, data: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.Estimate);
        }
      });
    });
  }

  /**
   * Update an existing Estimate in QuickBooks
   *
   * @param estimateId - QuickBooks estimate ID
   * @param updateData - Estimate update data
   * @param realmId - QuickBooks realm ID
   * @returns Updated estimate from QuickBooks
   */
  async updateEstimate(
    estimateId: string,
    updateData: any,
    realmId: string
  ): Promise<QBEstimate> {
    return new Promise((resolve, reject) => {
      const qb = (global as any).qbClient;

      if (!qb) {
        reject(new Error("QuickBooks client not initialized"));
        return;
      }

      qb.updateEstimate(updateData, (err: any, data: any) => {
        if (err) {
          reject(err);
        } else {
          resolve(data.Estimate);
        }
      });
    });
  }

  /**
   * Sync Estimates from QuickBooks to SmartBuild (Inbound)
   *
   * Fetches all estimates from QuickBooks and syncs them to SmartBuild,
   * handling both creation and updates based on idQuickbooks and timestamps.
   *
   * Step 7.2: Implement main sync method
   * Step 7.3: Implement create logic
   * Step 7.4: Implement update logic
   * Step 7.5: Handle project references
   */
  async syncEstimatesFromQuickBooks(
    companyId: string,
    userId: string,
    syncExecutionId?: string
  ): Promise<{
    created: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

    try {
      // Step 7.2: Fetch all estimates from QBO using REST API
      const qb = await getQbClientOrThrow(userId, companyId);

      console.log(
        `[QuickBooksEstimateController] Starting inbound estimate sync for company ${companyId}, user ${userId}`
      );

      // Query all estimates with Line items
      const query = `SELECT * FROM Estimate WHERE Line IN (SELECT Id FROM EstimateLine) STARTPOSITION 1 MAXRESULTS 1000`;
      
      const qbEstimates = await new Promise<QBEstimate[]>((resolve, reject) => {
        qb.query(query, (err: any, data: any) => {
          if (err) {
            console.error('[QuickBooksEstimateController] Query failed:', err);
            reject(err);
          } else {
            resolve(data.QueryResponse?.Estimate || []);
          }
        });
      });

      console.log(
        `[QuickBooksEstimateController] Found ${qbEstimates.length} estimates in QuickBooks`
      );

      // Step 7.2: Process each estimate with rate limiting
      for (const qbEstimate of qbEstimates) {
        try {
          // Step 7.5: Handle project references - Link to existing SmartBuild project by idQuickbooks
          let projectId: string | undefined;
          if (qbEstimate.ProjectRef?.value) {
            const project = await prisma.project.findFirst({
              where: {
                id: qbEstimate.ProjectRef.value,
              },
            });

            if (project) {
              projectId = project.id;
            } else {
              await createSyncLog({
                entity: 'estimates',
                action: 'Skipped',
                entityId: qbEstimate.Id,
                companyId,
                details: {
                  reason: 'Project referenced in QBO not found in SmartBuild',
                  qboProjectId: qbEstimate.ProjectRef.value,
                },
                syncExecutionId,
              });
              stats.skipped++;
              continue;
            }
          }

          // Step 7.3 & 7.4: Check if estimate exists and create or update
          const existingEstimate = await prisma.estimate.findFirst({
            where: {
              idQuickbooks: qbEstimate.Id,
            },
            include: {
              serviceProjects: true,
            },
          });

          if (existingEstimate) {
            // Step 7.4: Update logic
            const qbUpdatedAt = new Date(qbEstimate.MetaData?.LastUpdatedTime || new Date());
            const localUpdatedAt = existingEstimate.quickbooksUpdatedAt || new Date(0);

            if (qbUpdatedAt > localUpdatedAt) {
              // Step 7.4: Delete old EstimateServiceProject records
              await prisma.estimateServiceProject.deleteMany({
                where: {
                  estimateId: existingEstimate.id,
                },
              });

              // Map estimate data
              const mappedData = mapQBOEstimateToSmartBuild(qbEstimate);
              
              // Update estimate header
              const updateData: any = {
                ...mappedData,
                ...(projectId && { projectId }),
              };
              
              await prisma.estimate.update({
                where: { id: existingEstimate.id },
                data: updateData,
              });

              // Step 7.4: Create new line items
              if (qbEstimate.Line && qbEstimate.Line.length > 0) {
                for (const qbLine of qbEstimate.Line) {
                  const mappedLine = mapQBOEstimateLineToSBServiceProject(
                    qbLine,
                    existingEstimate.id
                  );
                  await prisma.estimateServiceProject.create({
                    data: {
                      name: mappedLine.name || 'Service',
                      description: mappedLine.description,
                      quantity: mappedLine.quantity || 1,
                      unitPrice: mappedLine.unitPrice || 0,
                      lineTotal: mappedLine.lineTotal || 0,
                      estimateId: existingEstimate.id,
                      idQuickbooksLine: mappedLine.idQuickbooksLine,
                    },
                  });
                }
              }

              await createSyncLog({
                entity: 'estimates',
                action: 'Updated',
                entityId: existingEstimate.id,
                companyId,
                details: {
                  reason: 'QuickBooks newer',
                  qbEstimateId: qbEstimate.Id,
                  qbUpdatedAt: qbEstimate.MetaData?.LastUpdatedTime,
                  localUpdatedAt,
                  linesCount: qbEstimate.Line?.length || 0,
                },
                syncExecutionId,
              });

              stats.updated++;
              console.log(
                `[QuickBooksEstimateController] Updated estimate ${existingEstimate.id} (QB ID: ${qbEstimate.Id})`
              );
            } else {
              await createSyncLog({
                entity: 'estimates',
                action: 'Skipped',
                entityId: existingEstimate.id,
                companyId,
                details: {
                  reason: 'QuickBooks not newer than local mirror',
                  qbEstimateId: qbEstimate.Id,
                  qbUpdatedAt: qbEstimate.MetaData?.LastUpdatedTime,
                  localUpdatedAt,
                },
                syncExecutionId,
              });

              stats.skipped++;
              console.log(
                `[QuickBooksEstimateController] Skipped estimate ${existingEstimate.id} - local is newer`
              );
            }
          } else {
            // Step 7.3: Create logic
            const mappedData = mapQBOEstimateToSmartBuild(qbEstimate);

            // projectId is required for Estimate - if not found in QBO, we cannot sync this estimate
            if (!projectId) {
              console.log(
                `[QuickBooksEstimateController] Cannot create estimate ${qbEstimate.Id} - no project reference found in QuickBooks`
              );
              stats.skipped++;
              continue;
            }

            // Create new estimate with explicit fields
            const newEstimate = await prisma.estimate.create({
              data: {
                number: mappedData.number || `QB-${qbEstimate.Id}`,
                approvedAt: new Date(qbEstimate.MetaData?.CreateTime || new Date()),
                totalAmount: mappedData.totalAmount || 0,
                description: mappedData.description,
                terms: mappedData.terms,
                status: mappedData.status || 'pending',
                assignatureRequired: false,
                amountPaid: 0,
                pdf_needs_update: false,
                type_estimate: 'estimateProject',
                isStandaloneEstimate: false,
                projectId: projectId,
                date_creation: new Date(qbEstimate.MetaData?.CreateTime || new Date()),
                idQuickbooks: mappedData.idQuickbooks,
                quickbooksUpdatedAt: mappedData.quickbooksUpdatedAt,
              },
            });

            // Step 7.4: Create EstimateServiceProject records for each line
            if (qbEstimate.Line && qbEstimate.Line.length > 0) {
              for (const qbLine of qbEstimate.Line) {
                const mappedLine = mapQBOEstimateLineToSBServiceProject(
                  qbLine,
                  newEstimate.id
                );
                await prisma.estimateServiceProject.create({
                  data: {
                    name: mappedLine.name || 'Service',
                    description: mappedLine.description,
                    quantity: mappedLine.quantity || 1,
                    unitPrice: mappedLine.unitPrice || 0,
                    lineTotal: mappedLine.lineTotal || 0,
                    estimateId: newEstimate.id,
                    idQuickbooksLine: mappedLine.idQuickbooksLine,
                    start_date: mappedLine.start_date,
                  },
                });
              }
            }

            await createSyncLog({
              entity: 'estimates',
              action: 'Inserted',
              entityId: newEstimate.id,
              companyId,
              details: {
                reason: 'New estimate from QuickBooks',
                qbEstimateId: qbEstimate.Id,
                qbEstimateNumber: qbEstimate.DocNumber,
                qbCustomerId: qbEstimate.CustomerRef?.value,
                linesCount: qbEstimate.Line?.length || 0,
              },
              syncExecutionId,
            });

            stats.created++;
            console.log(
              `[QuickBooksEstimateController] Created estimate ${newEstimate.id} from QB estimate ${qbEstimate.Id}`
            );
          }
        } catch (error: any) {
          console.error(
            `[QuickBooksEstimateController] Error processing estimate ${qbEstimate.Id}:`,
            error
          );

          await createSyncLog({
            entity: 'estimates',
            action: 'Error',
            entityId: qbEstimate.Id,
            companyId,
            details: {
              error: error?.message || String(error),
              qbEstimateId: qbEstimate.Id,
              stack: error?.stack,
            },
            syncExecutionId,
          });

          stats.errors++;
        }
      }

      console.log(
        `[QuickBooksEstimateController] Estimate sync completed: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
      );

      return stats;
    } catch (error: any) {
      console.error('[QuickBooksEstimateController] Sync failed:', error);
      throw error;
    }
  }

  /**
   * Express handler for syncing estimates from QuickBooks to SmartBuild
   */
  async syncEstimates(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: 'User ID não fornecido' });
    }

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID não fornecido' });
    }

    try {
      const stats = await this.syncEstimatesFromQuickBooks(companyId, userId, syncExecutionId);
      res.status(200).json({
        message: 'Sincronização de orçamentos concluída',
        ...stats,
      });
    } catch (error: any) {
      console.error('[QuickBooksEstimateController] Sync error:', error);
      res.status(500).json({
        error: 'Erro na sincronização de orçamentos',
        details: error?.message || String(error),
      });
    }
  }
}

export const quickBooksEstimateController = new QuickBooksEstimateController();
