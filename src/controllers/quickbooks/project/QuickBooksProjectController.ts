// src/controllers/quickbooks/project/QuickBooksProjectController.ts
import { prisma } from "../../../utils/prisma";
import { qboGraphQLClientForAccount } from "../util/http/qboGraphQLClientFactory";
import { Request, Response } from "express";
import Bottleneck from "bottleneck";

/**
 * Rate limiter for QuickBooks Projects API to avoid 429 errors
 * Limits to 1 request per 1100ms (within QuickBooks API limits)
 */
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100,
});

/**
 * Shape of a QuickBooks Project from GraphQL API
 */
interface QBProject {
  id: string;
  name: string;
  customerId: string;
  description?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  metaData: {
    createTime: string;
    lastUpdatedTime: string;
  };
}

/**
 * Shape of GraphQL response errors
 */
interface GraphQLError {
  message: string;
  code?: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

/**
 * Controller for QuickBooks Projects API operations
 * Uses GraphQL endpoint with rate limiting and error handling
 */
export class QuickBooksProjectController {
  /**
   * Express handler for syncing projects from QuickBooks to SmartBuild
   */
  async syncProjects(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    if (!userId) {
      return res.status(400).json({ error: 'User ID não fornecido' });
    }

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID não fornecido' });
    }

    try {
      const stats = await this.syncProjectsFromQuickBooks(companyId, userId, syncExecutionId);
      res.status(200).json({
        message: 'Sincronização de projetos concluída',
        ...stats,
      });
    } catch (error: any) {
      console.error('[QuickBooksProjectController] Sync error:', error);
      res.status(500).json({
        error: 'Erro na sincronização de projetos',
        details: error?.message || String(error),
      });
    }
  }

  /**
   * Execute GraphQL query with error handling and rate limiting
   */
  private async executeGraphQL<T>(
    query: string,
    variables: any,
    realmId: string
  ): Promise<T> {
    try {
      const account = await prisma.quickBooksAccount.findFirst({
        where: { realmId },
      });

      if (!account) {
        throw new Error("QuickBooks account not found for realmId");
      }

      const api = qboGraphQLClientForAccount(account.id);

      const response = await limiter.schedule(async () => {
        const result = await api.post<GraphQLResponse<T>>('', {
          query,
          variables,
        });
        return result.data;
      });

      // Check for GraphQL errors
      if (response.errors && response.errors.length > 0) {
        const firstError = response.errors[0];
        throw new Error(
          `GraphQL error: ${firstError.message}${firstError.code ? ` (code: ${firstError.code})` : ''}`
        );
      }

      if (!response.data) {
        throw new Error('GraphQL response missing data field');
      }

      return response.data;
    } catch (error: any) {
      console.error('[QuickBooksProjectController] GraphQL query failed:', error);
      throw error;
    }
  }

  /**
   * Check if Projects feature is enabled for the QuickBooks company
   *
   * @param realmId - QuickBooks realm ID
   * @returns true if Projects feature is enabled, false otherwise
   *
   * @example
   * ```typescript
   * const controller = new QuickBooksProjectController();
   * const enabled = await controller.checkProjectsEnabled(realmId);
   * if (!enabled) {
   *   console.log('Projects feature is not enabled in QuickBooks');
   * }
   * ```
   */
  async checkProjectsEnabled(realmId: string): Promise<boolean> {
    const query = `
      query CompanyPreferences {
        companyInfo {
          preferences {
            ProjectsEnabled
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      companyInfo: {
        preferences: {
          ProjectsEnabled: boolean;
        };
      };
    }>(query, {}, realmId);

    return result.companyInfo.preferences.ProjectsEnabled ?? false;
  }

  /**
   * Create a new project in QuickBooks
   *
   * @param input - Project data to create
   * @param realmId - QuickBooks realm ID
   * @returns Created project with QuickBooks ID
   *
   * @example
   * ```typescript
   * const controller = new QuickBooksProjectController();
   * const project = await controller.createProject({
   *   name: "Kitchen Renovation",
   *   customerId: "42",
   *   description: "Complete kitchen renovation",
   *   status: "OPEN",
   *   startDate: "2024-01-01",
   *   endDate: "2024-12-31"
   * }, realmId);
   * ```
   */
  async createProject(
    input: {
      name: string;
      customerId: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
    realmId: string
  ): Promise<QBProject> {
    const query = `
      mutation ProjectManagementCreateProject($input: ProjectManagementCreateProjectInput!) {
        projectManagementCreateProject(input: $input) {
          project {
            id
            name
            customerId
            description
            status
            startDate
            endDate
            metaData {
              createTime
              lastUpdatedTime
            }
          }
          errors {
            message
            code
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      projectManagementCreateProject: {
        project: QBProject;
        errors?: GraphQLError[];
      };
    }>(query, { input }, realmId);

    // Check for mutation errors
    const errors = result.projectManagementCreateProject.errors;
    if (errors && errors.length > 0) {
      const firstError = errors[0];
      throw new Error(
        `Failed to create project: ${firstError.message}${firstError.code ? ` (code: ${firstError.code})` : ''}`
      );
    }

    return result.projectManagementCreateProject.project;
  }

  /**
   * Get a specific project by QuickBooks ID
   *
   * @param id - QuickBooks Project ID
   * @param realmId - QuickBooks realm ID
   * @returns Project data
   *
   * @example
   * ```typescript
   * const controller = new QuickBooksProjectController();
   * const project = await controller.getProject("123456", realmId);
   * console.log(project.name);
   * ```
   */
  async getProject(id: string, realmId: string): Promise<QBProject> {
    const query = `
      query GetProject($id: ID!) {
        projectManagementProject(id: $id) {
          id
          name
          customerId
          description
          status
          startDate
          endDate
          metaData {
            createTime
            lastUpdatedTime
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      projectManagementProject: QBProject;
    }>(query, { id }, realmId);

    return result.projectManagementProject;
  }

  /**
   * List all projects for a QuickBooks company
   *
   * @param realmId - QuickBooks realm ID
   * @param limit - Maximum number of projects to return (optional, defaults to 100)
   * @returns Array of projects
   *
   * @example
   * ```typescript
   * const controller = new QuickBooksProjectController();
   * const projects = await controller.listProjects(realmId, 50);
   * console.log(`Found ${projects.length} projects`);
   * ```
   */
  async listProjects(realmId: string, limit: number = 100): Promise<QBProject[]> {
    const query = `
      query ListProjects($limit: Int) {
        projectManagementProjects(first: $limit) {
          nodes {
            id
            name
            customerId
            description
            status
            startDate
            endDate
            metaData {
              createTime
              lastUpdatedTime
            }
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      projectManagementProjects: {
        nodes: QBProject[];
      };
    }>(query, { limit }, realmId);

    return result.projectManagementProjects.nodes;
  }

  /**
   * Update an existing project in QuickBooks
   *
   * @param id - QuickBooks Project ID
   * @param input - Updated project data
   * @param realmId - QuickBooks realm ID
   * @returns Updated project data
   *
   * @example
   * ```typescript
   * const controller = new QuickBooksProjectController();
   * const updated = await controller.updateProject("123456", {
   *   name: "Updated Kitchen Renovation",
   *   status: "COMPLETED"
   * }, realmId);
   * ```
   */
  async updateProject(
    id: string,
    input: {
      name?: string;
      description?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
    realmId: string
  ): Promise<QBProject> {
    const query = `
      mutation ProjectManagementUpdateProject($id: ID!, $input: ProjectManagementUpdateProjectInput!) {
        projectManagementUpdateProject(id: $id, input: $input) {
          project {
            id
            name
            customerId
            description
            status
            startDate
            endDate
            metaData {
              createTime
              lastUpdatedTime
            }
          }
          errors {
            message
            code
          }
        }
      }
    `;

    const result = await this.executeGraphQL<{
      projectManagementUpdateProject: {
        project: QBProject;
        errors?: GraphQLError[];
      };
    }>(query, { id, input }, realmId);

    // Check for mutation errors
    const errors = result.projectManagementUpdateProject.errors;
    if (errors && errors.length > 0) {
      const firstError = errors[0];
      throw new Error(
        `Failed to update project: ${firstError.message}${firstError.code ? ` (code: ${firstError.code})` : ''}`
      );
    }

    return result.projectManagementUpdateProject.project;
  }

  async syncProjectsFromQuickBooks(
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
      const qbAccount = await prisma.quickBooksAccount.findFirst({
        where: { company_id: companyId },
      });

      if (!qbAccount) {
        throw new Error('QuickBooks account not found for this company');
      }

      const projectsEnabled = await this.checkProjectsEnabled(qbAccount.realmId);
      if (!projectsEnabled) {
        console.log(
          `[QuickBooksProjectController] Projects feature is not enabled in QuickBooks for company ${companyId}`
        );
        return stats;
      }

      console.log(
        `[QuickBooksProjectController] Starting inbound project sync for company ${companyId}, user ${userId}`
      );

      const qbProjects = await this.listProjects(qbAccount.realmId, 100);
      console.log(
        `[QuickBooksProjectController] Found ${qbProjects.length} projects in QuickBooks`
      );

      for (const qbProject of qbProjects) {
        try {
          const existingProject = await prisma.project.findFirst({
            where: {
              company_id: companyId,
              idQuickbooks: qbProject.id,
            },
          });

          if (existingProject) {
            const qbUpdatedAt = new Date(qbProject.metaData.lastUpdatedTime);
            const localUpdatedAt = existingProject.quickbooksUpdatedAt || new Date(0);

            if (qbUpdatedAt > localUpdatedAt) {
              await prisma.project.update({
                where: { id: existingProject.id },
                data: {
                  status_project: qbProject.status.toLowerCase(),
                  start_date: qbProject.startDate,
                  deadline: qbProject.endDate,
                  log: qbProject.description || existingProject.log,
                  idQuickbooks: qbProject.id,
                  quickbooksUpdatedAt: qbUpdatedAt,
                },
              });

              await this.createSyncLog({
                entity: 'projects',
                action: 'Updated',
                entityId: existingProject.id,
                companyId,
                details: {
                  reason: 'QuickBooks newer',
                  qbProjectId: qbProject.id,
                  qbUpdatedAt: qbProject.metaData.lastUpdatedTime,
                  localUpdatedAt: localUpdatedAt,
                },
                syncExecutionId,
              });

              stats.updated++;
              console.log(
                `[QuickBooksProjectController] Updated project ${existingProject.id} (QB ID: ${qbProject.id})`
              );
            } else {
              await this.createSyncLog({
                entity: 'projects',
                action: 'Skipped',
                entityId: existingProject.id,
                companyId,
                details: {
                  reason: 'QuickBooks not newer than local mirror',
                  qbProjectId: qbProject.id,
                  qbUpdatedAt: qbProject.metaData.lastUpdatedTime,
                  localUpdatedAt,
                },
                syncExecutionId,
              });

              stats.skipped++;
              console.log(
                `[QuickBooksProjectController] Skipped project ${existingProject.id} (QB ID: ${qbProject.id}) - local is newer`
              );
            }
          } else {
            const newProject = await prisma.project.create({
              data: {
                idQuickbooks: qbProject.id,
                quickbooksUpdatedAt: new Date(qbProject.metaData.lastUpdatedTime),
                status_project: qbProject.status.toLowerCase(),
                start_date: qbProject.startDate,
                deadline: qbProject.endDate,
                log: qbProject.description || `Imported from QuickBooks: ${qbProject.name}`,
                price: 0,
                company_id: companyId,
                seller_user_id: userId,
                date_creation: new Date(qbProject.metaData.createTime),
              },
            });

            await this.createSyncLog({
              entity: 'projects',
              action: 'Inserted',
              entityId: newProject.id,
              companyId,
              details: {
                reason: 'New project from QuickBooks',
                qbProjectId: qbProject.id,
                qbProjectName: qbProject.name,
                qbCustomerId: qbProject.customerId,
              },
              syncExecutionId,
            });

            stats.created++;
            console.log(
              `[QuickBooksProjectController] Created project ${newProject.id} from QB project ${qbProject.id}`
            );
          }
        } catch (error: any) {
          console.error(
            `[QuickBooksProjectController] Error processing project ${qbProject.id}:`,
            error
          );

          await this.createSyncLog({
            entity: 'projects',
            action: 'Error',
            entityId: qbProject.id,
            companyId,
            details: {
              error: error?.message || String(error),
              qbProjectId: qbProject.id,
              stack: error?.stack,
            },
            syncExecutionId,
          });

          stats.errors++;
        }
      }

      console.log(
        `[QuickBooksProjectController] Project sync completed: ${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`
      );

      return stats;
    } catch (error: any) {
      console.error('[QuickBooksProjectController] Sync failed:', error);
      throw error;
    }
  }

  private async createSyncLog(params: {
    entity: string;
    action: string;
    entityId: string;
    companyId: string;
    details: any;
    syncExecutionId?: string;
  }) {
    try {
      await prisma.syncLog.create({
        data: {
          entity: params.entity,
          action: params.action,
          entityId: params.entityId,
          companyId: params.companyId,
          details: params.details,
          ...(params.syncExecutionId ? { syncExecutionId: params.syncExecutionId } : {}),
        },
      });
    } catch (error) {
      console.error('[QuickBooksProjectController] Failed to create sync log:', error);
    }
  }
}
