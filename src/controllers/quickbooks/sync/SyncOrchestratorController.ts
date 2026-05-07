import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { QuickBooksClientController } from "../customer/QuickBooksCustomerController";
import { SyncStatus, SyncPreferences } from "@prisma/client";
import { QuickBooksCustomerOutboundController } from "../customer/QuickbooksCustomerOutboundController";
import { quickbooksQueue } from "../../../queue/quickbooksQueue";
import { QuickBooksProjectController } from "../project/QuickBooksProjectController";
import { normalizeSyncTypeForEntity } from "../syncPreference/syncPreferenceUtils";


export class SyncOrchestratorController {
    private quickBooksClientController: QuickBooksClientController;
    private quickBooksCustomerOutboundController: QuickBooksCustomerOutboundController;
    private quickBooksProjectController: QuickBooksProjectController;

    constructor() {
        this.quickBooksClientController = new QuickBooksClientController();
        this.quickBooksCustomerOutboundController = new QuickBooksCustomerOutboundController();
        this.quickBooksProjectController = new QuickBooksProjectController();

        // Bind methods to preserve 'this' context
        this.orchestrateSync = this.orchestrateSync.bind(this);
        this.executeExistingSync = this.executeExistingSync.bind(this);
        this.getSyncStatus = this.getSyncStatus.bind(this);
        this.createOrUpdatePreferences = this.createOrUpdatePreferences.bind(this);
        this.executeSync = this.executeSync.bind(this);
        this.canExecuteSync = this.canExecuteSync.bind(this);
        this.executeCustomerSyncFromQuickBooks = this.executeCustomerSyncFromQuickBooks.bind(this);

        // bind extra
        this.executeCustomerExportToQuickBooks = this.executeCustomerExportToQuickBooks.bind(this);
        this.executeCustomerPushUpdatesToQuickBooks = this.executeCustomerPushUpdatesToQuickBooks.bind(this);
        this.executeProjectSyncFromQuickBooks = this.executeProjectSyncFromQuickBooks.bind(this);
    }

    /**
     * Orquestra o processo completo de sincronização:
     * 1. Cria/atualiza as preferências de sincronização
     * 2. Executa a sincronização baseada nas preferências
     */
    async orchestrateSync(req: Request, res: Response) {
        const { companyId, userId } = req.params;
        const { syncPreferences } = req.body; 

        if (!userId || !companyId) {
            return res.status(400).json({ error: "User ID e Company ID são obrigatórios" });
        }
        if (!Array.isArray(syncPreferences) || syncPreferences.length === 0) {
            return res.status(400).json({ error: "Preferências de sincronização são obrigatórias" });
        }

        try {
            // 1) Cria/atualiza preferências (rápido)
            const createdPreferences = await this.createOrUpdatePreferences(syncPreferences, userId, companyId);

            // 2) Evita duplicar job para o mesmo par company/user
            const jobId = `sync:${companyId}:${userId}`;
            const existing = await quickbooksQueue.getJob(jobId);

            if (existing) {
                const state = await existing.getState();
                const emAndamento = ["waiting", "active", "delayed", "paused", "waiting-children"] as const;

                if (emAndamento.includes(state as any)) {
                    return res.status(202).json({
                        message: "There is already a synchronization in progress, please wait",
                        jobId: existing.id,
                        state, 
                    });
                }

                // Estado terminal (completed/failed) → remove e recria
                await existing.remove();
            }

            // 3) Cria novo job (com proteção contra corrida)
            try {
                const job = await quickbooksQueue.add(
                    "orchestrate",
                    { companyId, userId, prefs: createdPreferences },
                    { jobId }
                );

                return res.status(202).json({
                    message: "We are synchronizing your QuickBooks entities",
                    jobId: job.id,
                    preferences: createdPreferences,
                    // statusUrl: `/quickbooks/jobs/${job.id}`,
                });
            } catch (e: any) {
                // Se outra requisição criou o job no mesmo instante
                if (typeof e?.message === "string" && e.message.toLowerCase().includes("already exists")) {
                    const concurrent = await quickbooksQueue.getJob(jobId);
                    const state = concurrent ? await concurrent.getState() : "unknown";
                    return res.status(202).json({
                        message: "A synchronization has just started.",
                        jobId,
                        state,
                        // statusUrl: concurrent ? `/quickbooks/jobs/${concurrent.id}` : undefined,
                    });
                }
                throw e;
            }
        } catch (error: any) {
            console.error("Erro na orquestração de sincronização:", error);
            return res.status(500).json({ error: "Internal error in orchestration", details: error.message });
        }
    }


    /**
     * Executa apenas a sincronização baseada nas preferências existentes
     */
    async executeExistingSync(req: Request, res: Response) {
        const { companyId, userId } = req.params;

        if (!userId || !companyId) {
            return res.status(400).json({
                error: "User ID e Company ID são obrigatórios"
            });
        }

        try {
            // Buscar preferências existentes
            await prisma.syncPreferences.updateMany({
                where: {
                    companyId,
                    userId,
                    typesEntity: 'projects' as any,
                    NOT: {
                        typeSync: 'QuickBooksToSmartBuild',
                    }
                },
                data: {
                    typeSync: 'QuickBooksToSmartBuild',
                }
            });

            const preferences = await prisma.syncPreferences.findMany({
                where: {
                    companyId,
                    userId
                }
            });

            if (preferences.length === 0) {
                return res.status(404).json({
                    error: "Nenhuma preferência de sincronização encontrada para este usuário/empresa"
                });
            }

            // Executar sincronizações
            const syncResults = await this.executeSync(preferences, companyId, userId);

            return res.status(200).json({
                message: "Sincronização executada com base nas preferências existentes",
                syncResults: syncResults
            });

        } catch (error: any) {
            console.error("Erro na execução de sincronização:", error);
            return res.status(500).json({
                error: "Erro interno na execução",
                details: error.message
            });
        }
    }

    /**
     * Retorna o status atual das sincronizações
     */
    async getSyncStatus(req: Request, res: Response) {
        const { companyId, userId } = req.params;
        const { includeExecutions = 'true', limit = '10' } = req.query;

        if (!userId || !companyId) {
            return res.status(400).json({
                error: "User ID e Company ID são obrigatórios"
            });
        }

        try {
            // Buscar os status principais
            await prisma.syncPreferences.updateMany({
                where: {
                    companyId,
                    userId,
                    typesEntity: 'projects' as any,
                    NOT: {
                        typeSync: 'QuickBooksToSmartBuild',
                    }
                },
                data: {
                    typeSync: 'QuickBooksToSmartBuild',
                }
            });

            const syncStatuses = await (prisma as any).syncStatus.findMany({
                where: {
                    companyId,
                    userId
                },
                include: {
                    company: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true, email: true } },
                    ...(includeExecutions === 'true' && {
                        executions: {
                            orderBy: { startedAt: 'desc' },
                            take: parseInt(limit as string),
                            include: {
                                logs: {
                                    orderBy: { timestamp: 'desc' },
                                    take: 5 // últimos 5 logs por execução
                                }
                            }
                        }
                    })
                },
                orderBy: { updatedAt: 'desc' }
            });

            const preferences = await prisma.syncPreferences.findMany({
                where: {
                    companyId,
                    userId
                }
            });

            // Estatísticas das execuções
            const executionStats = await (prisma as any).syncExecution.groupBy({
                by: ['status'],
                where: {
                    companyId,
                    userId
                },
                _count: {
                    status: true
                }
            });

            const stats = executionStats.reduce((acc: any, stat: any) => {
                acc[stat.status.toLowerCase()] = stat._count.status;
                return acc;
            }, {});

            return res.status(200).json({
                syncStatuses,
                preferences,
                summary: {
                    totalSyncs: syncStatuses.length,
                    pending: syncStatuses.filter((s: any) => s.status === 'PENDING').length,
                    inProgress: syncStatuses.filter((s: any) => s.status === 'IN_PROGRESS').length,
                    completed: syncStatuses.filter((s: any) => s.status === 'COMPLETED').length,
                    failed: syncStatuses.filter((s: any) => s.status === 'FAILED').length
                },
                executionStats: {
                    total: Object.values(stats).reduce((a: any, b: any) => a + b, 0),
                    ...stats
                }
            });

        } catch (error: any) {
            console.error("Erro ao buscar status de sincronização:", error);
            return res.status(500).json({
                error: "Erro interno ao buscar status",
                details: error.message
            });
        }
    }

    /**
     * Retorna o histórico de execuções de uma sincronização específica
     */
    async getSyncExecutionHistory(req: Request, res: Response) {
        const { companyId, userId, entity, syncType } = req.params;
        const { page = '1', limit = '20' } = req.query;

        if (!userId || !companyId || !entity || !syncType) {
            return res.status(400).json({
                error: "User ID, Company ID, Entity e SyncType são obrigatórios"
            });
        }

        try {
            const pageNumber = parseInt(page as string);
            const limitNumber = parseInt(limit as string);
            const skip = (pageNumber - 1) * limitNumber;

            // Buscar o SyncStatus primeiro
            const syncStatus = await (prisma as any).syncStatus.findFirst({
                where: {
                    companyId,
                    userId,
                    entity,
                    syncType
                },
                include: {
                    company: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true, email: true } }
                }
            });

            if (!syncStatus) {
                return res.status(404).json({
                    error: "Sincronização não encontrada"
                });
            }

            // Buscar as execuções paginadas
            const executions = await (prisma as any).syncExecution.findMany({
                where: {
                    syncStatusId: syncStatus.id
                },
                include: {
                    logs: {
                        orderBy: { timestamp: 'desc' },
                        take: 10 // limitar logs por execução
                    }
                },
                orderBy: { startedAt: 'desc' },
                skip,
                take: limitNumber
            });

            // Contar total para paginação
            const totalExecutions = await (prisma as any).syncExecution.count({
                where: {
                    syncStatusId: syncStatus.id
                }
            });

            return res.status(200).json({
                syncStatus,
                executions,
                pagination: {
                    page: pageNumber,
                    limit: limitNumber,
                    total: totalExecutions,
                    totalPages: Math.ceil(totalExecutions / limitNumber)
                }
            });

        } catch (error: any) {
            console.error("Erro ao buscar histórico de execuções:", error);
            return res.status(500).json({
                error: "Erro interno ao buscar histórico",
                details: error.message
            });
        }
    }

    /**
     * Cria ou atualiza as preferências de sincronização
     */
    private async createOrUpdatePreferences(
        syncPreferences: any[],
        userId: string,
        companyId: string
    ): Promise<SyncPreferences[]> {
        const createdPreferences: SyncPreferences[] = [];

        for (const preference of syncPreferences) {
            const { typesEntity, typeSync, isDisable = false } = preference;
            const normalizedTypeSync = normalizeSyncTypeForEntity(typesEntity, typeSync);

            // Verificar se já existe uma preferência para esta entidade
            const existing = await prisma.syncPreferences.findFirst({
                where: {
                    typesEntity,
                    userId,
                    companyId
                }
            });

            if (existing) {
                // Atualizar existente
                const updated = await prisma.syncPreferences.update({
                    where: { id: existing.id },
                    data: { typeSync: normalizedTypeSync, isDisable }
                });
                createdPreferences.push(updated);
            } else {
                // Criar nova
                const created = await prisma.syncPreferences.create({
                    data: {
                        typesEntity,
                        typeSync: normalizedTypeSync,
                        isDisable,
                        userId,
                        companyId
                    }
                });
                createdPreferences.push(created);
            }
        }

        return createdPreferences;
    }

    /**
     * Executa as sincronizações baseadas nas preferências
     */
    async executeSync(
        preferences: SyncPreferences[],
        companyId: string,
        userId: string
    ) {
        const syncResults = [];

        for (const preference of preferences) {
            const { typesEntity, isDisable } = preference;
            const typeSync = normalizeSyncTypeForEntity(typesEntity, preference.typeSync);

            // Verificar se a sincronização está desabilitada
            if (isDisable) {
                syncResults.push({
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'DISABLED',
                    reason: 'Sincronização desabilitada nas preferências',
                    lastSyncAt: null
                });
                continue;
            }

            // Buscar ou criar SyncStatus (registro principal)
            let syncStatus = await (prisma as any).syncStatus.findFirst({
                where: {
                    companyId,
                    userId,
                    entity: typesEntity,
                    syncType: typeSync
                }
            });

            if (!syncStatus) {
                syncStatus = await (prisma as any).syncStatus.create({
                    data: {
                        companyId,
                        userId,
                        entity: typesEntity,
                        syncType: typeSync,
                        status: 'PENDING'
                    }
                });
            }

            // Verificar se pode executar a sincronização
            const canSync = await this.canExecuteSync(syncStatus);

            if (!canSync.allowed) {
                syncResults.push({
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'SKIPPED',
                    reason: canSync.reason,
                    lastSyncAt: syncStatus?.lastSyncAt
                });
                continue;
            }

            // Criar nova SyncExecution para esta execução específica
            const syncExecution = await (prisma as any).syncExecution.create({
                data: {
                    companyId,
                    userId,
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'IN_PROGRESS',
                    syncStatusId: syncStatus.id,
                    triggerType: 'manual', // ou baseado no contexto
                    startedAt: new Date()
                }
            });

            // Atualizar SyncStatus para refletir que está em progresso
            await (prisma as any).syncStatus.update({
                where: { id: syncStatus.id },
                data: {
                    status: 'IN_PROGRESS',
                    lastAttemptAt: new Date()
                }
            });

            const startTime = Date.now();

            try {
                // Executar sincronização baseada no tipo
                let syncResult: any = { steps: [] };

                if (typesEntity === 'customers') {
                    if (typeSync === 'QuickBooksToSmartBuild') {
                        // INBOUND somente
                        const inbound = await this.executeCustomerSyncFromQuickBooks(companyId, userId, syncExecution.id);
                        syncResult = { direction: 'QBO->Local', inbound };
                    } else if (typeSync === 'SmartBuildToQuickBooks') {
                        // OUTBOUND somente (export + updates) 
                        const exported = await this.executeCustomerExportToQuickBooks(companyId, userId, syncExecution.id);
                        syncResult = { direction: 'Local->QBO', exported };
                    } else if (typeSync === 'bidirectional') {
                        // OUTBOUND (export + updates) -> INBOUND
                        const exported = await this.executeCustomerExportToQuickBooks(companyId, userId, syncExecution.id);
                        const inbound = await this.executeCustomerSyncFromQuickBooks(companyId, userId, syncExecution.id);
                        syncResult = { direction: 'Both', exported, inbound };
                    } else {
                        throw new Error(`Tipo de sincronização não implementado: ${typesEntity} - ${typeSync}`);
                    }
                } else if (String(typesEntity) === 'projects') {
                    if (typeSync === 'QuickBooksToSmartBuild') {
                        const inbound = await this.executeProjectSyncFromQuickBooks(companyId, userId, syncExecution.id);
                        syncResult = { direction: 'QBO->Local', inbound };
                    } else {
                        throw new Error(`Tipo de sincronização não implementado: ${typesEntity} - ${typeSync}`);
                    }
                } else {
                    throw new Error(`Entidade não implementada: ${typesEntity}`);
                }

                const endTime = Date.now();
                const duration = endTime - startTime;

                // Atualizar SyncExecution como COMPLETED
                await (prisma as any).syncExecution.update({
                    where: { id: syncExecution.id },
                    data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                        duration,
                        successRecords:
                            (syncResult?.inbound?.synced || syncResult?.inbound?.count || 0) +
                            (syncResult?.exported?.created || syncResult?.exported?.createdCount || 0) +
                            (syncResult?.exported?.updated || syncResult?.exported?.updatedCount || 0),
                        errorRecords: 0,
                        details: syncResult
                    }
                });

                // Atualizar SyncStatus (registro principal)
                await (prisma as any).syncStatus.update({
                    where: { id: syncStatus.id },
                    data: {
                        status: 'COMPLETED',
                        lastSyncAt: new Date(),
                        lastError: null,
                        errorCount: 0
                    }
                });

                syncResults.push({
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'COMPLETED',
                    details: syncResult,
                    executionId: syncExecution.id,
                    duration,
                    lastSyncAt: new Date()
                });

            } catch (error: any) {
                console.error(` Erro na sincronização ${typesEntity} - ${typeSync}:`, error);
                console.error(` Detalhes do erro:`, {
                    message: error?.message,
                    details: error?.details,
                    debugInfo: error?.debugInfo,
                    statusCode: error?.statusCode,
                    fault: error?.Fault,
                    stack: error?.stack?.split('\n').slice(0, 5) // Primeiras 5 linhas do stack
                });

                const endTime = Date.now();
                const duration = endTime - startTime;

                // Preparar erro detalhado para salvar
                const errorDetails = {
                    message: error?.message || "Erro desconhecido",
                    details: error?.details,
                    debugInfo: error?.debugInfo,
                    statusCode: error?.statusCode,
                    fault: error?.Fault,
                    originalError: error?.originalError || error
                };

                // Atualizar SyncExecution como FAILED
                await (prisma as any).syncExecution.update({
                    where: { id: syncExecution.id },
                    data: {
                        status: 'FAILED',
                        completedAt: new Date(),
                        duration,
                        lastError: error?.details || error?.message || "Erro na sincronização",
                        // Salvar detalhes completos no campo details se existir
                        details: errorDetails
                    }
                });

                // Atualizar SyncStatus
                await (prisma as any).syncStatus.update({
                    where: { id: syncStatus.id },
                    data: {
                        status: 'FAILED',
                        lastError: error?.details || error?.message || "Erro na sincronização",
                        errorCount: (syncStatus.errorCount || 0) + 1
                    }
                });

                syncResults.push({
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'FAILED',
                    error: error?.details || error?.message || "Erro na sincronização",
                    errorDetails,
                    executionId: syncExecution.id,
                    duration,
                    lastAttemptAt: new Date()
                });
            }
        }

        return syncResults;
    }

    /**
     * Verifica se pode executar a sincronização
     */
    private async canExecuteSync(syncStatus: any): Promise<{ allowed: boolean; reason?: string }> {
        if (!syncStatus) {
            return { allowed: true };
        }

        // Se está em progresso, não pode executar
        if (syncStatus.status === 'IN_PROGRESS') {
            return {
                allowed: false,
                reason: 'Sincronização já está em progresso'
            };
        }

        // Se falhou muitas vezes, pausar por um tempo
        if (syncStatus.errorCount >= 5) {
            const lastAttempt = new Date(syncStatus.lastAttemptAt);
            const now = new Date();
            const hoursSinceLastAttempt = (now.getTime() - lastAttempt.getTime()) / (1000 * 60 * 60);

            if (hoursSinceLastAttempt < 1) { // Pausar por 1 hora após 5 erros
                return {
                    allowed: false,
                    reason: 'Muitos erros consecutivos. Tente novamente em 1 hora.'
                };
            }
        }

        // Se foi executada recentemente com sucesso, pode pular
        if (syncStatus.status === 'COMPLETED' && syncStatus.lastSyncAt) {
            const lastSync = new Date(syncStatus.lastSyncAt);
            const now = new Date();
            const minutesSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60);

            if (minutesSinceLastSync < 30) { // Evitar sincronização muito frequente
                return {
                    allowed: false,
                    reason: 'Sincronização executada recentemente. Aguarde 30 minutos.'
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Executa sincronização de clientes do QuickBooks para SmartBuild
     */
    private async executeCustomerSyncFromQuickBooks(companyId: string, userId: string, syncExecutionId: string) {
        // Simular requisição para o controller existente
        const mockRequest = {
            params: { companyId, userId },
            syncExecutionId // adicionar o ID da execução no request
        } as unknown as Request;

        let syncResult: any = {};
        const mockResponse = {
          status: (code: number) => ({
            json: (data: any) => {
              if (code === 200) {
                syncResult = data;
              } else {
                //  Melhorar propagação de erro com mais detalhes
                const error = new Error(data.error || 'Erro na sincronização');
                (error as any).details = data.details;
                (error as any).debugInfo = data.debugInfo;
                (error as any).statusCode = code;
                throw error;
              }
            }
          })
        } as unknown as Response;

        await this.quickBooksClientController.syncClients(mockRequest, mockResponse);
        return syncResult;
    }

    /**
     * Executa exportação inicial (Local -> QBO) para clientes sem idQuickbooks
     */
    private async executeCustomerExportToQuickBooks(companyId: string, userId: string, syncExecutionId: string) {
        const mockRequest = { 
            params: { companyId, userId },
            syncExecutionId // adicionar o ID da execução no request
        } as unknown as Request;

        let result: any = {};
        const mockResponse = {
          status: (code: number) => ({
            json: (data: any) => {
              if (code === 200) { 
                result = data;
              } else {
                //  Melhorar propagação de erro com mais detalhes
                const error = new Error(data.error || "Erro na exportação para QBO");
                (error as any).details = data.details;
                (error as any).debugInfo = data.debugInfo;
                (error as any).statusCode = code;
                throw error;
              }
            }
          })
        } as unknown as Response;

        await this.quickBooksCustomerOutboundController.exportMissingToQBO(mockRequest, mockResponse);
        return result; // { message, created }
    }

    /**
     * Executa push de atualizações (Local -> QBO) para clientes com idQuickbooks
     */
    private async executeCustomerPushUpdatesToQuickBooks(companyId: string, userId: string) {
        const mockRequest = { params: { companyId, userId } } as unknown as Request;

        let result: any = {};
        const mockResponse = {
            status: (code: number) => ({
                json: (data: any) => {
                    if (code === 200) {
                        result = data;
                    } else {
                        throw new Error(data.error || "Erro ao enviar atualizações ao QBO");
                    }
                }
            })
        } as unknown as Response;

        await this.quickBooksCustomerOutboundController.pushLocalUpdatesToQBO(mockRequest, mockResponse);
        return result; // { message, updated }
    }

    private async executeProjectSyncFromQuickBooks(companyId: string, userId: string, syncExecutionId: string) {
        const mockRequest = {
            params: { companyId, userId },
            syncExecutionId
        } as unknown as Request;

        let result: any = {};
        const mockResponse = {
            status: (code: number) => ({
                json: (data: any) => {
                    if (code === 200) {
                        result = data;
                    } else {
                        const error = new Error(data.error || "Erro na sincronização de projetos");
                        (error as any).details = data.details;
                        (error as any).statusCode = code;
                        throw error;
                    }
                }
            })
        } as unknown as Response;

        await this.quickBooksProjectController.syncProjectsQboToSmartBuild(mockRequest, mockResponse);
        return result;
    }

} 
