const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function validateUserCompany() {
    console.log('🔍 Iniciando validação UserCompany...');
    
    try {
        // 1. Verificar se todos os usuários com company_id têm registro na UserCompany
        const usersWithCompany = await prisma.user.findMany({
            where: {
                company_id: {
                    not: null
                }
            },
            select: {
                id: true,
                name: true,
                email: true,
                company_id: true
            }
        });

        console.log(`📊 Usuários com company_id: ${usersWithCompany.length}`);

        const userCompanyRelations = await prisma.userCompany.findMany({
            select: {
                userId: true,
                companyId: true,
                role: true
            }
        });

        console.log(`📊 Relações na UserCompany: ${userCompanyRelations.length}`);

        // 2. Verificar usuários que estão faltando na UserCompany
        const userCompanyMap = new Map();
        userCompanyRelations.forEach(relation => {
            const key = `${relation.userId}-${relation.companyId}`;
            userCompanyMap.set(key, relation);
        });

        const missingUsers = [];
        usersWithCompany.forEach(user => {
            const key = `${user.id}-${user.company_id}`;
            if (!userCompanyMap.has(key)) {
                missingUsers.push(user);
            }
        });

        if (missingUsers.length > 0) {
            console.log(`❌ ${missingUsers.length} usuários estão faltando na UserCompany:`);
            missingUsers.forEach(user => {
                console.log(`  - ${user.name} (${user.email}) - Company: ${user.company_id}`);
            });
        } else {
            console.log('✅ Todos os usuários com company_id estão na UserCompany');
        }

        // 3. Verificar relações órfãs na UserCompany
        const allUsers = await prisma.user.findMany({
            select: { id: true }
        });
        const allCompanies = await prisma.company.findMany({
            select: { id: true }
        });

        const userIds = new Set(allUsers.map(u => u.id));
        const companyIds = new Set(allCompanies.map(c => c.id));

        const orphanedRelations = userCompanyRelations.filter(relation => 
            !userIds.has(relation.userId) || !companyIds.has(relation.companyId)
        );

        if (orphanedRelations.length > 0) {
            console.log(`❌ ${orphanedRelations.length} relações órfãs encontradas na UserCompany:`);
            orphanedRelations.forEach(relation => {
                const userExists = userIds.has(relation.userId);
                const companyExists = companyIds.has(relation.companyId);
                console.log(`  - User: ${relation.userId} (existe: ${userExists}) - Company: ${relation.companyId} (existe: ${companyExists})`);
            });
        } else {
            console.log('✅ Nenhuma relação órfã encontrada na UserCompany');
        }

        // 4. Verificar duplicatas na UserCompany
        const duplicateCheck = await prisma.$queryRaw`
            SELECT userId, companyId, COUNT(*) as count
            FROM user_company 
            GROUP BY userId, companyId 
            HAVING COUNT(*) > 1
        `;

        if (duplicateCheck.length > 0) {
            console.log(`❌ ${duplicateCheck.length} duplicatas encontradas na UserCompany:`);
            duplicateCheck.forEach(dup => {
                console.log(`  - User: ${dup.userId} - Company: ${dup.companyId} (${dup.count} registros)`);
            });
        } else {
            console.log('✅ Nenhuma duplicata encontrada na UserCompany');
        }

        // 5. Verificar distribuição de papéis
        const roleDistribution = await prisma.userCompany.groupBy({
            by: ['role'],
            _count: {
                role: true
            }
        });

        console.log('\n📊 Distribuição de papéis:');
        roleDistribution.forEach(role => {
            console.log(`  - ${role.role}: ${role._count.role} usuários`);
        });

        // 6. Verificar integridade referencial
        const integritySql = await prisma.$queryRaw`
            SELECT 
                (SELECT COUNT(*) FROM user_company uc WHERE NOT EXISTS (SELECT 1 FROM User u WHERE u.id = uc.userId)) as orphaned_users,
                (SELECT COUNT(*) FROM user_company uc WHERE NOT EXISTS (SELECT 1 FROM Company c WHERE c.id = uc.companyId)) as orphaned_companies
        `;

        const integrity = integritySql[0];
        if (integrity.orphaned_users > 0 || integrity.orphaned_companies > 0) {
            console.log(`❌ Problemas de integridade referencial:`);
            console.log(`  - Usuários órfãos: ${integrity.orphaned_users}`);
            console.log(`  - Empresas órfãs: ${integrity.orphaned_companies}`);
        } else {
            console.log('✅ Integridade referencial OK');
        }

        // 7. Estatísticas gerais
        console.log('\n📈 Estatísticas gerais:');
        
        const stats = await prisma.$queryRaw`
            SELECT 
                COUNT(DISTINCT uc.userId) as unique_users,
                COUNT(DISTINCT uc.companyId) as unique_companies,
                COUNT(*) as total_relations,
                AVG(user_count.relations_per_user) as avg_relations_per_user,
                MAX(user_count.relations_per_user) as max_relations_per_user
            FROM user_company uc
            JOIN (
                SELECT userId, COUNT(*) as relations_per_user
                FROM user_company
                GROUP BY userId
            ) user_count ON uc.userId = user_count.userId
        `;

        const stat = stats[0];
        console.log(`  - Usuários únicos: ${stat.unique_users}`);
        console.log(`  - Empresas únicas: ${stat.unique_companies}`);
        console.log(`  - Total de relações: ${stat.total_relations}`);
        console.log(`  - Média de empresas por usuário: ${Number(stat.avg_relations_per_user).toFixed(2)}`);
        console.log(`  - Máximo de empresas por usuário: ${stat.max_relations_per_user}`);

        // 8. Usuários com múltiplas empresas
        const multiCompanyUsers = await prisma.$queryRaw`
            SELECT 
                uc.userId,
                u.name,
                u.email,
                COUNT(*) as company_count,
                GROUP_CONCAT(c.name SEPARATOR ', ') as companies
            FROM user_company uc
            JOIN User u ON uc.userId = u.id
            JOIN Company c ON uc.companyId = c.id
            GROUP BY uc.userId, u.name, u.email
            HAVING COUNT(*) > 1
            ORDER BY company_count DESC
            LIMIT 10
        `;

        if (multiCompanyUsers.length > 0) {
            console.log('\n👥 Usuários com múltiplas empresas:');
            multiCompanyUsers.forEach(user => {
                console.log(`  - ${user.name} (${user.email}): ${user.company_count} empresas - ${user.companies}`);
            });
        } else {
            console.log('\n👤 Nenhum usuário com múltiplas empresas encontrado');
        }

        // Resumo final
        console.log('\n📋 Resumo da validação:');
        const issues = [];
        
        if (missingUsers.length > 0) issues.push(`${missingUsers.length} usuários faltando`);
        if (orphanedRelations.length > 0) issues.push(`${orphanedRelations.length} relações órfãs`);
        if (duplicateCheck.length > 0) issues.push(`${duplicateCheck.length} duplicatas`);
        if (integrity.orphaned_users > 0 || integrity.orphaned_companies > 0) issues.push('problemas de integridade');

        if (issues.length === 0) {
            console.log('✅ Validação concluída com sucesso - Nenhum problema encontrado!');
        } else {
            console.log(`❌ Problemas encontrados: ${issues.join(', ')}`);
        }

    } catch (error) {
        console.error('❌ Erro durante a validação:', error);
        throw error;
    }
}

async function main() {
    try {
        await validateUserCompany();
        console.log('\n🎉 Validação concluída!');
    } catch (error) {
        console.error('💥 Falha na validação:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { validateUserCompany }; 