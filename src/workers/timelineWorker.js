const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

class TimelineWorker {
    static instance;
    
    static getInstance() {
        if (!TimelineWorker.instance) {
            TimelineWorker.instance = new TimelineWorker();
        }
        return TimelineWorker.instance;
    }

    constructor() {
        this.jobQueue = [];
        this.processing = false;
        this.cache = new Map();
    }

    // Cache para validações frequentes (15 minutos)
    getCachedValidation(key) {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
            return cached.data;
        }
        return null;
    }

    setCachedValidation(key, data) {
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    // Função otimizada para calcular distância
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Raio da Terra em km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    toRad(degrees) {
        return degrees * (Math.PI/180);
    }

    // Validação otimizada com cache
    async validateUserServiceProject(user_id, user_service_project_id, service_project_id) {
        const cacheKey = `validation_${user_id}_${user_service_project_id}_${service_project_id}`;
        const cached = this.getCachedValidation(cacheKey);
        
        if (cached) {
            return cached;
        }

        try {
            // Fazer uma única consulta otimizada em vez de múltiplas
            const result = await prisma.userServiceProject.findFirst({
                where: {
                    id: user_service_project_id,
                    user_id: user_id,
                    service_project_id: service_project_id
                },
                include: {
                    user: {
                        select: { id: true, name: true }
                    },
                    service_project: {
                        include: {
                            Project: {
                                include: {
                                    client: {
                                        select: {
                                            lat: true,
                                            log: true,
                                            radius: true
                                        }
                                    }
                                }
                            }
                        }
                    },
                    user_attendances: {
                        where: {
                            check_out_time: null
                        },
                        take: 1,
                        select: { id: true }
                    }
                }
            });

            const validation = {
                isValid: !!result,
                hasOpenAttendance: (result?.user_attendances?.length || 0) > 0,
                clientCoords: result?.service_project?.Project?.client ? {
                    lat: result.service_project.Project.client.lat,
                    lon: result.service_project.Project.client.log,
                    radius: result.service_project.Project.client.radius
                } : null
            };

            this.setCachedValidation(cacheKey, validation);
            return validation;

        } catch (error) {
            console.error('[TIMELINE-WORKER] Validation error:', error);
            return { isValid: false, hasOpenAttendance: false, clientCoords: null };
        }
    }

    // Processar timeline individual
    async processCreateTimeline(data) {
        try {
            const { user_id, user_service_project_id, service_project_id, check_in_latitude, check_in_longitude } = data;

            // Validação otimizada
            const validation = await this.validateUserServiceProject(user_id, user_service_project_id, service_project_id);

            if (!validation.isValid) {
                return { success: false, error: 'Invalid user service project' };
            }

            if (!validation.hasOpenAttendance) {
                return { success: false, error: 'No open attendance found' };
            }

            // Calcular is_local_work se necessário
            let isLocalWork = data.is_local_work || false;
            if (!data.is_local_work && validation.clientCoords && validation.clientCoords.lat && validation.clientCoords.lon && validation.clientCoords.radius) {
                const distance = this.calculateDistance(
                    check_in_latitude,
                    check_in_longitude,
                    Number(validation.clientCoords.lat),
                    Number(validation.clientCoords.lon)
                );
                const radiusInKm = Number(validation.clientCoords.radius) / 1000;
                isLocalWork = distance <= radiusInKm;
            }

            // Criar timeline
            const timeline = await prisma.timeLine.create({
                data: {
                    user_id,
                    service_project_id,
                    userServiceProjectId: user_service_project_id,
                    check_in_time: data.check_in_time || new Date(),
                    check_in_address: data.check_in_address,
                    check_in_latitude: check_in_latitude,
                    check_in_longitude: check_in_longitude,
                    is_local_work: isLocalWork,
                }
            });

            console.log(`[TIMELINE-WORKER] Timeline created successfully: ${timeline.id}`);
            return { success: true, timeline };

        } catch (error) {
            console.error('[TIMELINE-WORKER] Error creating timeline:', error);
            return { success: false, error: 'Failed to create timeline' };
        }
    }

    // Processar múltiplas timelines em lote
    async processBatchCreateTimeline(data) {
        const results = [];
        
        // Processar em lotes de 10 para evitar sobrecarga
        const batchSize = 10;
        for (let i = 0; i < data.timelines.length; i += batchSize) {
            const batch = data.timelines.slice(i, i + batchSize);
            const batchPromises = batch.map(timeline => this.processCreateTimeline(timeline));
            const batchResults = await Promise.allSettled(batchPromises);
            
            results.push(...batchResults.map(result => 
                result.status === 'fulfilled' ? result.value : { success: false, error: 'Promise rejected' }
            ));
        }

        return { success: true, results };
    }

    // Adicionar job à fila
    addJob(job) {
        this.jobQueue.push(job);
        console.log(`[TIMELINE-WORKER] Job added to queue: ${job.type}, Queue size: ${this.jobQueue.length}`);
        
        // Processar fila se não estiver processando
        if (!this.processing) {
            this.processQueue();
        }
    }

    // Processar fila de jobs
    async processQueue() {
        if (this.processing || this.jobQueue.length === 0) {
            return;
        }

        this.processing = true;
        console.log(`[TIMELINE-WORKER] Processing queue with ${this.jobQueue.length} jobs`);

        while (this.jobQueue.length > 0) {
            const job = this.jobQueue.shift();
            await this.processJob(job);
        }

        this.processing = false;
        console.log('[TIMELINE-WORKER] Queue processing completed');
    }

    // Processar job individual
    async processJob(job) {
        const startTime = Date.now();
        
        try {
            let result;
            
            switch (job.type) {
                case 'CREATE_TIMELINE':
                    result = await this.processCreateTimeline(job.data);
                    break;
                    
                case 'BATCH_CREATE_TIMELINE':
                    result = await this.processBatchCreateTimeline(job.data);
                    break;
                    
                case 'CALCULATE_DISTANCE':
                    const { lat1, lon1, lat2, lon2 } = job.data;
                    result = { distance: this.calculateDistance(lat1, lon1, lat2, lon2) };
                    break;
                    
                default:
                    console.error(`[TIMELINE-WORKER] Unknown job type: ${job.type}`);
                    return;
            }

            const processingTime = Date.now() - startTime;
            console.log(`[TIMELINE-WORKER] Job ${job.id} completed in ${processingTime}ms`);

            // Notificar resultado se necessário
            if (parentPort) {
                parentPort.postMessage({
                    jobId: job.id,
                    success: true,
                    result,
                    processingTime
                });
            }

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`[TIMELINE-WORKER] Job ${job.id} failed after ${processingTime}ms:`, error);

            if (parentPort) {
                parentPort.postMessage({
                    jobId: job.id,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    processingTime
                });
            }
        }
    }

    // Limpar cache periodicamente
    cleanCache() {
        const now = Date.now();
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > 15 * 60 * 1000) { // 15 minutos
                this.cache.delete(key);
            }
        }
    }

    // Inicializar worker
    init() {
        console.log('[TIMELINE-WORKER] Worker initialized');
        
        // Limpar cache a cada 5 minutos
        setInterval(() => {
            this.cleanCache();
        }, 5 * 60 * 1000);

        // Receber mensagens do thread principal
        if (parentPort) {
            parentPort.on('message', (message) => {
                if (message.type === 'ADD_JOB') {
                    this.addJob(message.job);
                }
            });
        }
    }
}

// Executar worker se não for thread principal
if (!isMainThread) {
    const worker = TimelineWorker.getInstance();
    worker.init();
}

module.exports = { TimelineWorker }; 