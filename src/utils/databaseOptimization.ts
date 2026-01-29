import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class DatabaseOptimization {
    // Verificar se um índice existe
    static async indexExists(tableName: string, indexName: string): Promise<boolean> {
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
            console.error(`[DB-OPTIMIZATION] Error checking index ${indexName}:`, error);
            return false;
        }
    }

    // Criar índices de performance sem migrations (via SQL raw)
    static async createPerformanceIndexes(): Promise<void> {
        try {
            console.log('[DB-OPTIMIZATION] Creating performance indexes...');

            // Índice composto para timeline por user_service_project e data
            const timelineUserServiceIndex = 'idx_timeline_user_service_project_time';
            if (!(await this.indexExists('TimeLine', timelineUserServiceIndex))) {
                await prisma.$executeRaw`
CREATE INDEX idx_timeline_user_service_project_time 
ON TimeLine(userServiceProjectId, check_in_time DESC)
`;
                console.log(`[DB-OPTIMIZATION] Created index: ${timelineUserServiceIndex}`);
            } else {
                console.log(`[DB-OPTIMIZATION] Index already exists: ${timelineUserServiceIndex}`);
            }

            // Índice para consultas de attendance abertos
            const attendanceOpenIndex = 'idx_user_attendance_open';
            if (!(await this.indexExists('user_attendance', attendanceOpenIndex))) {
                await prisma.$executeRaw`
CREATE INDEX idx_user_attendance_open 
ON user_attendance(user_id, user_service_project_id, check_out_time)
`;
                console.log(`[DB-OPTIMIZATION] Created index: ${attendanceOpenIndex}`);
            } else {
                console.log(`[DB-OPTIMIZATION] Index already exists: ${attendanceOpenIndex}`);
            }

            // Índice para timeline por usuário e data
            const timelineUserDateIndex = 'idx_timeline_user_date';
            if (!(await this.indexExists('TimeLine', timelineUserDateIndex))) {
                await prisma.$executeRaw`
CREATE INDEX idx_timeline_user_date 
ON TimeLine(user_id, check_in_time DESC)
`;
                console.log(`[DB-OPTIMIZATION] Created index: ${timelineUserDateIndex}`);
            } else {
                console.log(`[DB-OPTIMIZATION] Index already exists: ${timelineUserDateIndex}`);
            }

            // Índice para service_project_id na timeline
            const timelineServiceProjectIndex = 'idx_timeline_service_project';
            if (!(await this.indexExists('TimeLine', timelineServiceProjectIndex))) {
                await prisma.$executeRaw`
CREATE INDEX idx_timeline_service_project 
ON TimeLine(service_project_id, check_in_time DESC)
`;
                console.log(`[DB-OPTIMIZATION] Created index: ${timelineServiceProjectIndex}`);
            } else {
                console.log(`[DB-OPTIMIZATION] Index already exists: ${timelineServiceProjectIndex}`);
            }

            console.log('[DB-OPTIMIZATION] Performance indexes verification completed successfully');

        } catch (error) {
            console.error('[DB-OPTIMIZATION] Error creating indexes:', error);
            // Não lançar erro para não quebrar a aplicação
        }
    }

    // Otimizar configurações de conexão do Prisma
    static async optimizeConnectionPool(): Promise<void> {
        try {
            console.log('[DB-OPTIMIZATION] Optimizing connection pool...');

            // Configurar timeout de query (tratar erros individualmente)
            try {
                await prisma.$executeRaw`SET SESSION wait_timeout = 300`;
                console.log('[DB-OPTIMIZATION] Set wait_timeout successfully');
            } catch (error) {
                console.warn('[DB-OPTIMIZATION] Could not set wait_timeout:', error);
            }

            try {
                await prisma.$executeRaw`SET SESSION interactive_timeout = 300`;
                console.log('[DB-OPTIMIZATION] Set interactive_timeout successfully');
            } catch (error) {
                console.warn('[DB-OPTIMIZATION] Could not set interactive_timeout:', error);
            }

            // Otimizar configurações do InnoDB para timeline
            try {
                await prisma.$executeRaw`SET SESSION innodb_lock_wait_timeout = 5`;
                console.log('[DB-OPTIMIZATION] Set innodb_lock_wait_timeout successfully');
            } catch (error) {
                console.warn('[DB-OPTIMIZATION] Could not set innodb_lock_wait_timeout:', error);
            }

            console.log('[DB-OPTIMIZATION] Connection pool optimization completed');

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

    // Verificar se uma tabela existe
    static async tableExists(tableName: string): Promise<boolean> {
        try {
            const result = await prisma.$queryRaw`
SELECT COUNT(*) as count 
FROM information_schema.tables 
WHERE table_schema = DATABASE() 
AND table_name = ${tableName}
` as any[];
            return result[0]?.count > 0;
        } catch (error) {
            console.error(`[DB-OPTIMIZATION] Error checking table ${tableName}:`, error);
            return false;
        }
    }

    // Otimizar tabela TimeLine (OPTIMIZE TABLE)
    static async optimizeTimelineTable(): Promise<void> {
        try {
            console.log('[DB-OPTIMIZATION] Optimizing tables...');

            // Otimizar tabela TimeLine
            if (await this.tableExists('TimeLine')) {
                try {
                    await prisma.$executeRaw`OPTIMIZE TABLE TimeLine`;
                    console.log('[DB-OPTIMIZATION] TimeLine table optimized successfully');
                } catch (error) {
                    console.warn('[DB-OPTIMIZATION] Could not optimize TimeLine table:', error);
                }
            } else {
                console.log('[DB-OPTIMIZATION] TimeLine table does not exist, skipping optimization');
            }

            // Otimizar tabela user_attendance
            if (await this.tableExists('user_attendance')) {
                try {
                    await prisma.$executeRaw`OPTIMIZE TABLE user_attendance`;
                    console.log('[DB-OPTIMIZATION] user_attendance table optimized successfully');
                } catch (error) {
                    console.warn('[DB-OPTIMIZATION] Could not optimize user_attendance table:', error);
                }
            } else {
                console.log('[DB-OPTIMIZATION] user_attendance table does not exist, skipping optimization');
            }

            console.log('[DB-OPTIMIZATION] Table optimization completed');

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