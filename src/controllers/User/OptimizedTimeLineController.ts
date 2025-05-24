import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPresignedUrl } from '../../utils/S3/getPresignedUrl';
import { logAudit } from '../../utils/auditLogger';
import { returnPayLoad } from '../../config/returnPayLoad';
import { TimelineWorkerManager } from '../../services/TimelineWorkerManager';
import { CreateTimelineData } from '../../workers/timelineWorker';

const prisma = new PrismaClient();

export class OptimizedTimeLineController {
    private workerManager: TimelineWorkerManager;
    private cache = new Map<string, { data: any; timestamp: number }>();
    private readonly CACHE_TTL = 10 * 60 * 1000; // 10 minutos

    constructor() {
        this.workerManager = TimelineWorkerManager.getInstance();
    }

    // Cache para validações rápidas
    private getCached(key: string): any {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }
        return null;
    }

    private setCache(key: string, data: any): void {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // Validação básica rápida (sem DB) para rejeitar requests inválidos imediatamente
    private validateRequestData(data: any): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!data.user_id || typeof data.user_id !== 'string') {
            errors.push('user_id is required and must be a string');
        }

        if (!data.user_service_project_id || typeof data.user_service_project_id !== 'string') {
            errors.push('user_service_project_id is required and must be a string');
        }

        if (!data.service_project_id || typeof data.service_project_id !== 'string') {
            errors.push('service_project_id is required and must be a string');
        }

        if (!data.check_in_address || typeof data.check_in_address !== 'string') {
            errors.push('check_in_address is required and must be a string');
        }

        if (data.check_in_latitude === undefined || typeof data.check_in_latitude !== 'number') {
            errors.push('check_in_latitude is required and must be a number');
        }

        if (data.check_in_longitude === undefined || typeof data.check_in_longitude !== 'number') {
            errors.push('check_in_longitude is required and must be a number');
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    // Versão otimizada e assíncrona do handleTimeLine
    handleTimeLineOptimized = async (req: Request, res: Response): Promise<void> => {
        const startTime = Date.now();
        
        try {
            const requestData = req.body;

            // Validação rápida dos dados de entrada
            const validation = this.validateRequestData(requestData);
            if (!validation.valid) {
                console.log('[OPTIMIZED-TIMELINE] Validation failed:', validation.errors);
                res.status(400).json({ 
                    error: 'Invalid request data', 
                    details: validation.errors 
                });
                return;
            }

            // Preparar dados para o worker
            const timelineData: CreateTimelineData = {
                user_id: requestData.user_id,
                user_service_project_id: requestData.user_service_project_id,
                service_project_id: requestData.service_project_id,
                check_in_address: requestData.check_in_address,
                check_in_latitude: Number(requestData.check_in_latitude),
                check_in_longitude: Number(requestData.check_in_longitude),
                is_local_work: requestData.is_local_work,
                check_in_time: new Date()
            };

            // Processar no worker (assíncrono)
            const result = await this.workerManager.createTimeline(timelineData);

            if (result.success) {
                const responseTime = Date.now() - startTime;
                console.log(`[OPTIMIZED-TIMELINE] Timeline created successfully in ${responseTime}ms`);
                
                res.status(201).json({
                    ...result.timeline,
                    processing_time_ms: responseTime
                });
            } else {
                console.log('[OPTIMIZED-TIMELINE] Worker failed:', result.error);
                res.status(400).json({ 
                    error: result.error || 'Failed to create timeline' 
                });
            }

        } catch (error) {
            const responseTime = Date.now() - startTime;
            console.error(`[OPTIMIZED-TIMELINE] Error after ${responseTime}ms:`, error);
            res.status(500).json({ 
                error: 'Internal server error',
                processing_time_ms: responseTime
            });
        }
    }

    // Versão "fire-and-forget" para alto volume (não aguarda resultado)
    handleTimeLineAsync = async (req: Request, res: Response): Promise<void> => {
        try {
            const requestData = req.body;

            // Validação rápida
            const validation = this.validateRequestData(requestData);
            if (!validation.valid) {
                res.status(400).json({ 
                    error: 'Invalid request data', 
                    details: validation.errors 
                });
                return;
            }

            // Preparar dados
            const timelineData: CreateTimelineData = {
                user_id: requestData.user_id,
                user_service_project_id: requestData.user_service_project_id,
                service_project_id: requestData.service_project_id,
                check_in_address: requestData.check_in_address,
                check_in_latitude: Number(requestData.check_in_latitude),
                check_in_longitude: Number(requestData.check_in_longitude),
                is_local_work: requestData.is_local_work,
                check_in_time: new Date()
            };

            // Enviar para worker sem aguardar resultado
            this.workerManager.createTimelineAsync(timelineData);

            // Resposta imediata
            res.status(202).json({ 
                message: 'Timeline processing queued',
                status: 'accepted'
            });

        } catch (error) {
            console.error('[OPTIMIZED-TIMELINE-ASYNC] Error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Endpoint para processar múltiplas timelines em lote
    handleTimeLineBatch = async (req: Request, res: Response): Promise<void> => {
        try {
            const { timelines } = req.body;

            if (!Array.isArray(timelines) || timelines.length === 0) {
                res.status(400).json({ error: 'timelines array is required and must not be empty' });
                return;
            }

            // Validar cada timeline
            const validTimelines: CreateTimelineData[] = [];
            const errors: string[] = [];

            for (let i = 0; i < timelines.length; i++) {
                const validation = this.validateRequestData(timelines[i]);
                if (validation.valid) {
                    validTimelines.push({
                        user_id: timelines[i].user_id,
                        user_service_project_id: timelines[i].user_service_project_id,
                        service_project_id: timelines[i].service_project_id,
                        check_in_address: timelines[i].check_in_address,
                        check_in_latitude: Number(timelines[i].check_in_latitude),
                        check_in_longitude: Number(timelines[i].check_in_longitude),
                        is_local_work: timelines[i].is_local_work,
                        check_in_time: timelines[i].check_in_time ? new Date(timelines[i].check_in_time) : new Date()
                    });
                } else {
                    errors.push(`Timeline ${i}: ${validation.errors.join(', ')}`);
                }
            }

            if (validTimelines.length === 0) {
                res.status(400).json({ 
                    error: 'No valid timelines found',
                    details: errors
                });
                return;
            }

            // Processar lote no worker
            const result = await this.workerManager.createTimelineBatch(validTimelines);

            res.status(200).json({
                processed: validTimelines.length,
                results: result.results,
                errors: errors.length > 0 ? errors : undefined
            });

        } catch (error) {
            console.error('[OPTIMIZED-TIMELINE-BATCH] Error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Versão otimizada do handleTimeLineByWorker com cache
    handleTimeLineByWorkerOptimized = async (req: Request, res: Response): Promise<void> => {
        try {
            const { user_service_project_id, date } = req.params;
            
            if (!user_service_project_id) {
                res.status(400).json({ error: "user_service_project_id is required" });
                return;
            }

            // Cache key para a consulta
            const cacheKey = `timeline_worker_${user_service_project_id}_${date || 'all'}`;
            const cachedResult = this.getCached(cacheKey);
            
            if (cachedResult) {
                console.log(`[OPTIMIZED-TIMELINE] Cache hit for ${cacheKey}`);
                res.status(200).json({
                    ...cachedResult,
                    cached: true,
                    cache_timestamp: new Date().toISOString()
                });
                return;
            }

            // Buscar UserServiceProject com uma única consulta otimizada
            const userServiceProject = await prisma.userServiceProject.findFirst({
                where: {
                    id: String(user_service_project_id)
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            avatar: true
                        }
                    },
                    service_project: {
                        select: {
                            id: true,
                            name: true,
                            description: true
                        }
                    }
                }
            });
            
            if (!userServiceProject) {
                console.log(user_service_project_id, 'UserServiceProject not found')
                res.status(404).json({ error: "UserServiceProject not found" });
                return;
            }
            
            // Gerar URL assinada para o avatar (se necessário)
            let userWithPresignedAvatar = { ...userServiceProject.user };
            if (userServiceProject.user?.avatar) {
                userWithPresignedAvatar.avatar = await getPresignedUrl(userServiceProject.user.avatar);
            }
            
            // Preparar filtro de data
            let dateFilter = {};
            if (date) {
                const selectedDate = new Date(date as string);
                const nextDay = new Date(selectedDate);
                nextDay.setDate(nextDay.getDate() + 1);
                
                dateFilter = {
                    check_in_time: {
                        gte: selectedDate,
                        lt: nextDay
                    }
                };
            }
            
            // Buscar timelines com índices otimizados
            const timelines = await prisma.timeLine.findMany({
                where: {
                    userServiceProjectId: String(user_service_project_id),
                    ...dateFilter
                },
                select: {
                    id: true,
                    check_in_time: true,
                    check_in_address: true,
                    check_in_latitude: true,
                    check_in_longitude: true,
                    is_local_work: true,
                    date_creation: true
                },
                orderBy: {
                    check_in_time: 'desc'
                },
                take: 1000 // Limitar a 1000 registros para evitar consultas muito pesadas
            });

            const result = {
                userServiceProject: {
                    ...userServiceProject,
                    user: userWithPresignedAvatar
                },
                timelines,
                dateFilter: date ? new Date(date as string).toISOString().split('T')[0] : null,
                count: timelines.length
            };

            // Armazenar no cache por 5 minutos (dados recentes mudam rapidamente)
            this.setCache(cacheKey, result);
            
            res.status(200).json({
                ...result,
                cached: false
            });
            
        } catch (error) {
            console.error("Error fetching timeline by worker:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }

    // Endpoint para estatísticas dos workers
    getWorkerStats = async (req: Request, res: Response): Promise<void> => {
        try {
            const stats = this.workerManager.getStats();
            res.status(200).json({
                worker_stats: stats,
                cache_size: this.cache.size,
                server_time: new Date().toISOString()
            });
        } catch (error) {
            console.error('[OPTIMIZED-TIMELINE] Error getting stats:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Limpar cache manualmente
    clearCache = async (req: Request, res: Response): Promise<void> => {
        try {
            const cacheSize = this.cache.size;
            this.cache.clear();
            res.status(200).json({ 
                message: 'Cache cleared successfully',
                cleared_entries: cacheSize
            });
        } catch (error) {
            console.error('[OPTIMIZED-TIMELINE] Error clearing cache:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    }

    // Função para limpar cache automaticamente
    private cleanExpiredCache(): void {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.cache.delete(key);
            }
        }
    }

    // Inicializar limpeza automática de cache
    initAutoCleanup(): void {
        setInterval(() => {
            this.cleanExpiredCache();
        }, 5 * 60 * 1000); // A cada 5 minutos
    }
} 