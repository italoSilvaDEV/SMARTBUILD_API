import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import { SyncPreferencesController } from "../syncPreference/syncPreferenceController";
import { QuickBooksClientController } from "../customer/QuickBooksCustomerController";
import { SyncStatus, SyncPreferences } from "@prisma/client";
import { QuickBooksCustomerOutboundController } from "../customer/QuickbooksCustomerOutboundController";


export class SyncOrchestratorController {
    private syncPreferencesController: SyncPreferencesController;
    private quickBooksClientController: QuickBooksClientController;
    private quickBooksCustomerOutboundController: QuickBooksCustomerOutboundController;

    constructor() {
        this.syncPreferencesController = new SyncPreferencesController();
        this.quickBooksClientController = new QuickBooksClientController();
        this.quickBooksCustomerOutboundController = new QuickBooksCustomerOutboundController();

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
            return res.status(400).json({
                error: "User ID e Company ID são obrigatórios"
            });
        }

        if (!syncPreferences || !Array.isArray(syncPreferences)) {
            return res.status(400).json({
                error: "Preferências de sincronização são obrigatórias"
            });
        }

        try {
            // 1. Criar/atualizar preferências de sincronização
            const createdPreferences = await this.createOrUpdatePreferences(
                syncPreferences,
                userId,
                companyId
            );

            // 2. Executar sincronizações baseadas nas preferências
            const syncResults = await this.executeSync(createdPreferences, companyId, userId);

            return res.status(200).json({
                message: "Orquestração de sincronização concluída",
                preferences: createdPreferences,
                syncResults: syncResults
            });



        } catch (error: any) {
            console.error("Erro na orquestração de sincronização:", error);
            return res.status(500).json({
                error: "Erro interno na orquestração",
                details: error.message
            });
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

        if (!userId || !companyId) {
            return res.status(400).json({
                error: "User ID e Company ID são obrigatórios"
            });
        }

        try {
            const syncStatuses = await (prisma as any).syncStatus.findMany({
                where: {
                    companyId,
                    userId
                },
                include: {
                    company: { select: { id: true, name: true } },
                    user: { select: { id: true, name: true, email: true } }
                },
                orderBy: { updatedAt: 'desc' }
            });

            const preferences = await prisma.syncPreferences.findMany({
                where: {
                    companyId,
                    userId
                }
            });

            return res.status(200).json({
                syncStatuses,
                preferences,
                summary: {
                    totalSyncs: syncStatuses.length,
                    pending: syncStatuses.filter((s: any) => s.status === 'PENDING').length,
                    inProgress: syncStatuses.filter((s: any) => s.status === 'IN_PROGRESS').length,
                    completed: syncStatuses.filter((s: any) => s.status === 'COMPLETED').length,
                    failed: syncStatuses.filter((s: any) => s.status === 'FAILED').length
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
     * Cria ou atualiza as preferências de sincronização
     */
    private async createOrUpdatePreferences(
        syncPreferences: any[],
        userId: string,
        companyId: string
    ): Promise<SyncPreferences[]> {
        const createdPreferences: SyncPreferences[] = [];

        for (const preference of syncPreferences) {
            const { typesEntity, typeSync } = preference;

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
                    data: { typeSync }
                });
                createdPreferences.push(updated);
            } else {
                // Criar nova
                const created = await prisma.syncPreferences.create({
                    data: {
                        typesEntity,
                        typeSync,
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
    private async executeSync(
        preferences: SyncPreferences[],
        companyId: string,
        userId: string
    ) {
        const syncResults = [];

        for (const preference of preferences) {
            const { typesEntity, typeSync } = preference;

            // Verificar se já existe um status de sincronização
            let syncStatus = await (prisma as any).syncStatus.findFirst({
                where: {
                    companyId,
                    userId,
                    entity: typesEntity,
                    syncType: typeSync
                }
            });

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

            // Criar ou atualizar status de sincronização
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

            // Atualizar status para IN_PROGRESS
            await (prisma as any).syncStatus.update({
                where: { id: syncStatus.id },
                data: {
                    status: 'IN_PROGRESS',
                    lastAttemptAt: new Date()
                }
            });

            try {
             
                // Executar sincronização baseada no tipo
                let syncResult: any = { steps: [] };

                if (typesEntity === 'customers') {
                    if (typeSync === 'QuickBooksToSmartBuild') {
                        // INBOUND somente
                        const inbound = await this.executeCustomerSyncFromQuickBooks(companyId, userId);
                        syncResult = { direction: 'QBO->Local', inbound };
                    } else if (typeSync === 'SmartBuildToQuickBooks') {
                        // OUTBOUND somente (export + updates)
                        const exported = await this.executeCustomerExportToQuickBooks(companyId, userId);
                        // const pushed = await this.executeCustomerPushUpdatesToQuickBooks(companyId, userId);
                        // syncResult = { direction: 'Local->QBO', exported, pushed };
                        syncResult = { direction: 'Local->QBO', exported};
                        
                    }
                     else if (typeSync === 'bidirectional') {
                        // OUTBOUND (export + updates) -> INBOUND
                        const exported = await this.executeCustomerExportToQuickBooks(companyId, userId);
                        const pushed = await this.executeCustomerSyncFromQuickBooks(companyId, userId);
                        // const pushed = await this.executeCustomerPushUpdatesToQuickBooks(companyId, userId);
                        // const inbound = await this.executeCustomerSyncFromQuickBooks(companyId, userId);
                        // syncResult = { direction: 'Both', exported, pushed, inbound };
                        syncResult = { direction: 'Both', exported, pushed };

                    } else {
                        throw new Error(`Tipo de sincronização não implementado: ${typesEntity} - ${typeSync}`);
                    }
                } else {
                    throw new Error(`Entidade não implementada: ${typesEntity}`);
                }

                // Atualizar status para COMPLETED
                await (prisma as any).syncStatus.update({
                    where: { id: syncStatus.id },
                    data: {
                        status: 'COMPLETED',
                        lastSyncAt: new Date(),
                        // tenta somar alguma métrica de sucesso, se vier
                        successRecords:
                            (syncResult?.inbound?.synced || 0) +
                            (syncResult?.exported?.created || 0) +
                            (syncResult?.pushed?.updated || 0),
                        errorCount: 0,
                        lastError: null
                    }
                });

                syncResults.push({
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'COMPLETED',
                    details: syncResult,
                    lastSyncAt: new Date()
                });

            } catch (error: any) {
                console.error(`Erro na sincronização ${typesEntity} - ${typeSync}:`, error);

                // Atualizar status para FAILED
                await (prisma as any).syncStatus.update({
                    where: { id: syncStatus.id },
                    data: {
                        status: 'FAILED',
                        lastError: error.message,
                        errorCount: (syncStatus.errorCount || 0) + 1
                    }
                });

                syncResults.push({
                    entity: typesEntity,
                    syncType: typeSync,
                    status: 'FAILED',
                    error: error.message,
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
    private async executeCustomerSyncFromQuickBooks(companyId: string, userId: string) {
        // Simular requisição para o controller existente
        const mockRequest = {
            params: { companyId, userId }
        } as unknown as Request;

        let syncResult: any = {};
        const mockResponse = {
            status: (code: number) => ({
                json: (data: any) => {
                    if (code === 200) {
                        syncResult = data;
                    } else {
                        throw new Error(data.error || 'Erro na sincronização');
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
    private async executeCustomerExportToQuickBooks(companyId: string, userId: string) {
        const mockRequest = { params: { companyId, userId } } as unknown as Request;

        let result: any = {};
        const mockResponse = {
            status: (code: number) => ({
                json: (data: any) => {
                    if (code === 200) {
                        result = data;
                    } else {
                        throw new Error(data.error || "Erro na exportação para QBO");
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
} 