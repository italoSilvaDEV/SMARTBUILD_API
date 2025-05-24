import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DatabaseOptimization {
    // Criar índices de performance sem migrations (via SQL raw)
    static async createPerformanceIndexes(): Promise<void> {
        try {
            console.log('[DB-OPTIMIZATION] Creating performance indexes...');

            // Índice composto para timeline por user_service_project e data
            await prisma.$executeRaw`
                CREATE INDEX IF NOT EXISTS idx_timeline_user_service_project_time 
                ON TimeLine(userServiceProjectId, check_in_time DESC)
            `;

            // Índice para consultas de attendance abertos
            await prisma.$executeRaw`
                CREATE INDEX IF NOT EXISTS idx_user_attendance_open 
                ON user_attendance(user_id, user_service_project_id, check_out_time)
            `;

            // Índice para timeline por usuário e data
            await prisma.$executeRaw`
                CREATE INDEX IF NOT EXISTS idx_timeline_user_date 
                ON TimeLine(user_id, check_in_time DESC)
            `;

            // Índice para service_project_id na timeline
            await prisma.$executeRaw`
                CREATE INDEX IF NOT EXISTS idx_timeline_service_project 
                ON TimeLine(service_project_id, check_in_time DESC)
            `;

            console.log('[DB-OPTIMIZATION] Performance indexes created successfully');

        } catch (error) {
            console.error('[DB-OPTIMIZATION] Error creating indexes:', error);
            // Não lançar erro para não quebrar a aplicação
        }
    }

    // Otimizar configurações de conexão do Prisma
    static async optimizeConnectionPool(): Promise<void> {
        try {
            console.log('[DB-OPTIMIZATION] Optimizing connection pool...');

            // Configurar timeout de query
            await prisma.$executeRaw`SET SESSION wait_timeout = 300`;
            await prisma.$executeRaw`SET SESSION interactive_timeout = 300`;

            // Otimizar configurações do InnoDB para timeline
            await prisma.$executeRaw`SET SESSION innodb_lock_wait_timeout = 5`;

            console.log('[DB-OPTIMIZATION] Connection pool optimized');

        } catch (error) {
            console.error('[DB-OPTIMIZATION] Error optimizing connection pool:', error);
        }
    }

    // Analisar performance das tabelas relacionadas ao timeline
    static async analyzeTimelinePerformance(): Promise<any> {
        try {
            console.log('[DB-OPTIMIZATION] Analyzing timeline performance...');

            // Estatísticas da tabela TimeLine
            const timelineStats = await prisma.$queryRaw`
                SELECT 
                    COUNT(*) as total_records,
                    COUNT(DISTINCT user_id) as unique_users,
                    COUNT(DISTINCT userServiceProjectId) as unique_projects,
                    MIN(check_in_time) as oldest_record,
                    MAX(check_in_time) as newest_record,
                    AVG(check_in_latitude) as avg_latitude,
                    AVG(check_in_longitude) as avg_longitude
                FROM TimeLine
            `;

            // Estatísticas de performance por usuário
            const userStats = await prisma.$queryRaw`
                SELECT 
                    user_id,
                    COUNT(*) as timeline_count,
                    MIN(check_in_time) as first_timeline,
                    MAX(check_in_time) as last_timeline
                FROM TimeLine 
                GROUP BY user_id 
                ORDER BY timeline_count DESC 
                LIMIT 10
            `;

            // Verificar índices existentes
            const indexes = await prisma.$queryRaw`
                SHOW INDEX FROM TimeLine
            `;

            return {
                timeline_stats: timelineStats,
                top_users: userStats,
                indexes: indexes,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            console.error('[DB-OPTIMIZATION] Error analyzing performance:', error);
            return { error: 'Failed to analyze performance' };
        }
    }

    // Limpar registros antigos de timeline (mais de X dias)
    static async cleanupOldTimeline(daysToKeep: number = 90): Promise<number> {
        try {
            console.log(`[DB-OPTIMIZATION] Cleaning up timeline records older than ${daysToKeep} days...`);

            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

            const deleteResult = await prisma.timeLine.deleteMany({
                where: {
                    check_in_time: {
                        lt: cutoffDate
                    }
                }
            });

            console.log(`[DB-OPTIMIZATION] Cleaned up ${deleteResult.count} old timeline records`);
            return deleteResult.count;

        } catch (error) {
            console.error('[DB-OPTIMIZATION] Error cleaning up timeline:', error);
            return 0;
        }
    }

    // Otimizar tabela TimeLine (OPTIMIZE TABLE)
    static async optimizeTimelineTable(): Promise<void> {
        try {
            console.log('[DB-OPTIMIZATION] Optimizing TimeLine table...');

            await prisma.$executeRaw`OPTIMIZE TABLE TimeLine`;
            await prisma.$executeRaw`OPTIMIZE TABLE user_attendance`;

            console.log('[DB-OPTIMIZATION] Tables optimized successfully');

        } catch (error) {
            console.error('[DB-OPTIMIZATION] Error optimizing tables:', error);
        }
    }

    // Executar todas as otimizações
    static async runAllOptimizations(): Promise<void> {
        console.log('[DB-OPTIMIZATION] Starting complete optimization process...');

        await this.createPerformanceIndexes();
        await this.optimizeConnectionPool();
        await this.optimizeTimelineTable();

        console.log('[DB-OPTIMIZATION] Complete optimization process finished');
    }

    // Verificar saúde do banco relacionado ao timeline
    static async checkTimelineHealth(): Promise<any> {
        try {
            const stats = await this.analyzeTimelinePerformance();
            
            const health = {
                status: 'healthy',
                issues: [] as string[],
                recommendations: [] as string[],
                stats
            };

            // Verificar se há muitos registros sem índices adequados
            if (stats.timeline_stats?.[0]?.total_records > 100000) {
                health.recommendations.push('Consider implementing data archiving for timeline records older than 90 days');
            }

            // Verificar se há usuários com volume muito alto
            const topUser = stats.top_users?.[0];
            if (topUser?.timeline_count > 10000) {
                health.recommendations.push(`User ${topUser.user_id} has ${topUser.timeline_count} timeline records - consider optimization`);
            }

            return health;

        } catch (error) {
            return {
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Executar otimizações na inicialização (opcional)
export async function initializeDatabaseOptimizations(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
        // Em produção, executar otimizações automaticamente
        setTimeout(async () => {
            await DatabaseOptimization.runAllOptimizations();
        }, 5000); // Aguardar 5 segundos após o start
    }
} 