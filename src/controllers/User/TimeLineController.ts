import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getPresignedUrl } from '../../utils/S3/getPresignedUrl';
import { AuditController } from '../Audit/AuditController';
import { logAudit } from '../../utils/auditLogger';
import { returnPayLoad } from '../../config/returnPayLoad';

const prisma = new PrismaClient();

export class TimeLineController {
    private cache = new Map<string, { data: any; timestamp: number }>();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos para cache

    constructor() {
        // Auto-limpeza de cache a cada 5 minutos
        setInterval(() => {
            this.cleanExpiredCache();
        }, 5 * 60 * 1000);

        // Inicializar otimizações de banco de forma segura
        // this.initializeDatabaseOptimizations();
    }

    private async initializeDatabaseOptimizations(): Promise<void> {
        try {
            // Executar otimizações após 10 segundos (não bloquear startup)
            setTimeout(async () => {
                try {
                    console.log('[TIMELINE-CONTROLLER] Initializing database optimizations...');
                    // Criar índices de performance de forma segura
                    await this.createSafeIndexes();
                    console.log('[TIMELINE-CONTROLLER] Database optimizations completed');
                } catch (error) {
                    console.error('[TIMELINE-CONTROLLER] Error in delayed optimization:', error);
                }
            }, 10000);
        } catch (error) {
            console.error('[TIMELINE-CONTROLLER] Error initializing optimizations:', error);
        }
    }

    private async createSafeIndexes(): Promise<void> {
        try {
            // Verificar e criar índices de forma segura
            // Verificar se índice timeline_user_service_project_time existe
            const timelineUserServiceExists = await this.indexExists('TimeLine', 'idx_timeline_user_service_project_time');
            if (!timelineUserServiceExists) {
                await prisma.$executeRaw`
CREATE INDEX idx_timeline_user_service_project_time 
ON TimeLine(userServiceProjectId, check_in_time DESC)
`;
                console.log('[TIMELINE-CONTROLLER] Created index: idx_timeline_user_service_project_time');
            } else {
                console.log('[TIMELINE-CONTROLLER] Index already exists: idx_timeline_user_service_project_time');
            }

            // Verificar se índice user_attendance_open existe
            const attendanceOpenExists = await this.indexExists('user_attendance', 'idx_user_attendance_open');
            if (!attendanceOpenExists) {
                await prisma.$executeRaw`
CREATE INDEX idx_user_attendance_open 
ON user_attendance(user_id, user_service_project_id, check_out_time)
`;
                console.log('[TIMELINE-CONTROLLER] Created index: idx_user_attendance_open');
            } else {
                console.log('[TIMELINE-CONTROLLER] Index already exists: idx_user_attendance_open');
            }

            // Verificar se índice timeline_user_date existe
            const timelineUserDateExists = await this.indexExists('TimeLine', 'idx_timeline_user_date');
            if (!timelineUserDateExists) {
                await prisma.$executeRaw`
CREATE INDEX idx_timeline_user_date 
ON TimeLine(user_id, check_in_time DESC)
`;
                console.log('[TIMELINE-CONTROLLER] Created index: idx_timeline_user_date');
            } else {
                console.log('[TIMELINE-CONTROLLER] Index already exists: idx_timeline_user_date');
            }

            console.log('[TIMELINE-CONTROLLER] Performance indexes verification completed successfully');
        } catch (error) {
            console.error('[TIMELINE-CONTROLLER] Error creating indexes (non-critical):', error);
            // Não lançar erro para não quebrar a aplicação
        }
    }

    // Método auxiliar para verificar se um índice existe
    private async indexExists(tableName: string, indexName: string): Promise<boolean> {
        try {
            const result = await prisma.$queryRaw`
SELECT COUNT(*) as count 
FROM information_schema.statistics 
WHERE table_schema = DATABASE() 
AND table_name = ${tableName} 
AND index_name = ${indexName}
` as any[];
            return result[0]?.count > 0;
        } catch (error) {
            console.error(`[TIMELINE-CONTROLLER] Error checking index ${indexName}:`, error);
            return false;
        }
    }

    private cleanExpiredCache(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];
        this.cache.forEach((value, key) => {
            if (now - value.timestamp > this.CACHE_TTL) {
                keysToDelete.push(key);
            }
        });
        keysToDelete.forEach(key => this.cache.delete(key));
    }

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

    // Função para calcular distância entre coordenadas usando Haversine
    private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
        const R = 6371; // Raio da Terra em km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distância em km
    }

    private toRad(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private async performAutoCheckOut(
        user_id: string,
        user_service_project_id: string,
        check_in_address: string,
        check_in_latitude: number,
        check_in_longitude: number
    ) {
        /* Código de auto check-out às 18h comentado
        const now = new Date();
        if (now.getHours() >= 18) {
        // Busca o registro de attendance aberto
        const openAttendance = await prisma.userAttendance.findFirst({
        where: {
        user_id,
        user_service_project_id,
        check_out_time: null,
        },
        });
        
        if (openAttendance) {
        // Realiza o check-out automático
        await prisma.userAttendance.update({
        where: { id: openAttendance.id },
        data: {
        check_out_time: now,
        check_out_address: check_in_address, // Usa o mesmo endereço do check-in
        check_out_latitude: check_in_latitude,
        check_out_longitude: check_in_longitude,
        },
        });
        }
        }
        */
    }

    // Check-in do usuário - OTIMIZADO (interface mantida igual)
    handleTimeLine = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude,
                service_project_id,
            } = req.body;

            // Verifica se o usuário existe
            const userExists = await prisma.user.findUnique({ where: { id: user_id } });
            if (!userExists) {
                console.log('error', 'User not found.')
                res.status(400).json({ error: 'User not found.' });
                return;
            }

            // Verifica se o ServiceProject existe e obtém suas coordenadas
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: service_project_id },
                include: {
                    Project: {
                        include: {
                            client: true
                        }
                    }
                }
            });

            if (!serviceProject) {
                console.log('error', 'ServiceProject not found.')
                res.status(400).json({ error: 'ServiceProject not found.' });
                return;
            }

            // Verifica se o UserServiceProject existe
            const serviceProjectExists = await prisma.userServiceProject.findUnique({
                where: { id: user_service_project_id },
                include: {
                    service_project: true
                }
            });

            if (!serviceProjectExists) {
                console.log('error', 'UserServiceProject not found.')
                res.status(400).json({ error: 'UserServiceProject not found.' });
                return;
            }

            // Verifica se já existe um registro aberto
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                // Continua com o processamento normal
            } else {
                res.status(400).json({
                    error: 'No open attendance found. Please check in first.',
                });
                return;
            }

            let isLocalWork = false;

            // Verifica se as coordenadas foram fornecidas
            if (check_in_latitude && check_in_longitude &&
                serviceProject.Project?.client?.lat &&
                serviceProject.Project?.client?.log &&
                serviceProject.Project?.client?.radius) {
                // Calcula a distância entre os pontos
                const distance = this.calculateDistance(
                    Number(check_in_latitude),
                    Number(check_in_longitude),
                    Number(serviceProject.Project.client.lat),
                    Number(serviceProject.Project.client.log)
                );

                // Verifica se está dentro do raio (convertendo o raio para km)
                const radiusInKm = Number(serviceProject.Project.client.radius) / 1000;
                isLocalWork = distance <= radiusInKm;
            }

            // Cria o registro de check-in
            const attendance = await prisma.timeLine.create({
                data: {
                    user_id,
                    service_project_id,
                    userServiceProjectId: user_service_project_id,
                    check_in_time: new Date(),
                    check_in_address,
                    check_in_latitude,
                    check_in_longitude,
                    is_local_work: isLocalWork,
                },
            });
            res.status(201).json(attendance);
        } catch (error) {
            console.log('error', error)
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }

    // Check-in do usuário (client version) - OTIMIZADO
    handleTimeLineClient = async (req: Request, res: Response): Promise<void> => {
        try {
            const {
                user_id,
                user_service_project_id,
                check_in_address,
                check_in_latitude,
                check_in_longitude,
                service_project_id,
                is_local_work
            } = req.body;

            // Verifica se o usuário existe
            const userExists = await prisma.user.findUnique({ where: { id: user_id } });
            if (!userExists) {
                console.log('error', 'User not found.')
                res.status(400).json({ error: 'User not found.' });
                return;
            }

            // Verifica se o ServiceProject existe e obtém suas coordenadas
            const serviceProject = await prisma.serviceProject.findUnique({
                where: { id: service_project_id },
                include: {
                    Project: {
                        include: {
                            client: true
                        }
                    }
                }
            });

            if (!serviceProject) {
                console.log('error', 'ServiceProject not found.')
                res.status(400).json({ error: 'ServiceProject not found.' });
                return;
            }

            // Verifica se o UserServiceProject existe
            const serviceProjectExists = await prisma.userServiceProject.findUnique({
                where: { id: user_service_project_id },
                include: {
                    service_project: true
                }
            });

            if (!serviceProjectExists) {
                console.log('error', 'UserServiceProject not found.')
                res.status(400).json({ error: 'UserServiceProject not found.' });
                return;
            }

            // Verifica se já existe um registro aberto
            const openAttendance = await prisma.userAttendance.findFirst({
                where: {
                    user_id,
                    user_service_project_id,
                    check_out_time: null,
                },
            });

            if (openAttendance) {
                // Continua com o processamento normal
            } else {
                res.status(400).json({
                    error: 'No open attendance found. Please check in first.',
                });
                return;
            }

            if (!service_project_id) {
                console.log('error', 'service_project_id is required');
                res.status(400).json({ error: 'service_project_id is required.' });
                return;
            }

            // Cria o registro de check-in
            const attendance = await prisma.timeLine.create({
                data: {
                    user_id,
                    service_project_id,
                    userServiceProjectId: user_service_project_id,
                    check_in_time: new Date(),
                    check_in_address,
                    check_in_latitude,
                    check_in_longitude,
                    is_local_work,
                },
            });

            res.status(201).json(attendance);
        } catch (error) {
            console.log('error', error)
            console.error(error);
            res.status(500).json({ error: 'Error while checking in.' });
        }
    }

    // Atualização do método para buscar timeline por worker - OTIMIZADO COM CACHE
    handleTimeLineByWorker = async (req: Request, res: Response): Promise<Response> => {
        try {
            const { user_service_project_id, date } = req.params;
            if (!user_service_project_id) {
                return res.status(400).json({ error: "user_service_project_id is required" });
            }

            // Cache para consultas frequentes (5 minutos para dados que mudam)
            const cacheKey = `timeline_worker_${user_service_project_id}_${date || 'all'}`;
            const cachedResult = this.getCached(cacheKey);
            if (cachedResult) {
                console.log(`[TIMELINE-CACHE] Cache hit for ${cacheKey}`);
                return res.status(200).json(cachedResult);
            }
            // Buscar o UserServiceProject para verificar se existe
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
                        include: {
                            Project: {
                                include: {
                                    client: {
                                        select: {
                                            id: true,
                                            name: true,
                                            location: true,
                                            lat: true,
                                            log: true,
                                            radius: true
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            if (!userServiceProject) {
                console.log(user_service_project_id, 'UserServiceProject not found')
                return res.status(404).json({ error: "UserServiceProject not found" });
            }
            // Gerar URL assinada para o avatar do usuário, se existir
            let userWithPresignedAvatar = { ...userServiceProject.user };
            if (userServiceProject.user?.avatar) {
                userWithPresignedAvatar.avatar = await getPresignedUrl(userServiceProject.user.avatar);
            }
            // Preparar filtro de data se fornecido
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
            // Buscar todas as timelines associadas a este UserServiceProject com filtro de data opcional
            // OTIMIZADO: select apenas campos necessários e limit para evitar consultas muito pesadas
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
                    date_creation: true,
                    date_update: true,
                    user_id: true,
                    service_project_id: true,
                    userServiceProjectId: true
                },
                orderBy: {
                    check_in_time: 'desc'
                },
                take: 1000 // Limitar para evitar consultas muito pesadas
            });

            const result = {
                userServiceProject: {
                    ...userServiceProject,
                    user: userWithPresignedAvatar
                },
                // Coordenadas do projeto para cálculo de distância no frontend
                projectCoordinates: userServiceProject?.service_project?.Project?.client ? {
                    location: userServiceProject.service_project.Project.client.location,
                    latitude: userServiceProject.service_project.Project.client.lat ? Number(userServiceProject.service_project.Project.client.lat) : null,
                    longitude: userServiceProject.service_project.Project.client.log ? Number(userServiceProject.service_project.Project.client.log) : null,
                    radius: userServiceProject.service_project.Project.client.radius ? Number(userServiceProject.service_project.Project.client.radius) : null,
                    radiusInKm: userServiceProject.service_project.Project.client.radius ? Number(userServiceProject.service_project.Project.client.radius) / 1000 : null
                } : null,
                timelines,
                dateFilter: date ? new Date(date as string).toISOString().split('T')[0] : null
            };

            // Armazenar no cache (TTL menor para dados que mudam frequentemente)
            this.setCache(cacheKey, result);
            return res.status(200).json(result);
        } catch (error) {
            console.error("Error fetching timeline by worker:", error);
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    // Delete timeline record
    deleteTimeline = async (req: Request, res: Response): Promise<void> => {
        try {
            const user = returnPayLoad(req);
            if (!user) {
                res.status(401).json({ error: 'Unauthorized' });
                return;
            }

            const { id } = req.params;
            // Verify if the timeline exists
            const timeline = await prisma.userAttendance.findUnique({
                where: { id },
                include: {
                    user: true,
                    UserServiceProject: {
                        include: {
                            service_project: true
                        }
                    }
                }
            });
            if (!timeline) {
                res.status(404).json({ error: 'Timeline record not found.' });
                return;
            }
            const clockInTime = timeline?.check_in_time ? new Date(timeline.check_in_time).toLocaleString() : 'N/A';
            const clockOutTime = timeline?.check_out_time ? new Date(timeline.check_out_time).toLocaleString() : 'N/A';
            const auditMessage = `Delete clock-in/clock-out record ${timeline.id} for user ${timeline.user.name} (${timeline.user.id}) on service project ${timeline.UserServiceProject.service_project.name || 'Unnamed project'} (${timeline.UserServiceProject.service_project.id}). Clock-in: ${clockInTime}, Clock-out: ${clockOutTime}`;
            logAudit(auditMessage, user.id);
            await prisma.userAttendance.delete({
                where: { id }
            });
            res.status(200).json({ message: 'Timeline record deleted successfully.' });
        } catch (error) {
            console.error('Error deleting timeline:', error);
            res.status(500).json({ error: 'Error while deleting timeline record.' });
        }
    }
}
