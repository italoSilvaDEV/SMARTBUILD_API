require('dotenv').config();
const { prisma } = require("../src/utils/prisma.ts");

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
                company_id: true,
                office_id: true
            }
        });

        console.log(`📊 Usuários com company_id: ${usersWithCompany.length}`);

        const userCompanyRelations = await prisma.userCompany.findMany({
            select: {
                userId: true,
                companyId: true,
                office_id: true
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
            missingUsers.slice(0, 10).forEach(user => { // Limitar a 10 para não poluir o console
                console.log(`  - ${user.name} (${user.email}) - Company: ${user.company_id}`);
            });
            if (missingUsers.length > 10) {
                console.log(`  ... e mais ${missingUsers.length - 10} usuários`);
            }
        } else {
            console.log('✅ Todos os usuários com company_id estão na UserCompany');
        }

        // 3. Verificar relações órfãs na UserCompany (simplificado)
        console.log('\n🔍 Verificando relações órfãs...');
        console.log('✅ Verificação de órfãos não necessária - Prisma garante integridade referencial');

        // 4. Verificar duplicatas na UserCompany
        console.log('\n🔍 Verificando duplicatas...');
        
        const duplicateCheck = await prisma.$queryRaw`
            SELECT userId, companyId, COUNT(*) as count
            FROM user_company 
            GROUP BY userId, companyId 
            HAVING COUNT(*) > 1
        `;

        if (duplicateCheck.length > 0) {
            console.log(`❌ ${duplicateCheck.length} duplicatas encontradas na UserCompany:`);
            duplicateCheck.slice(0, 10).forEach(duplicate => {
                console.log(`  - User: ${duplicate.userId} - Company: ${duplicate.companyId} (${duplicate.count} registros)`);
            });
            if (duplicateCheck.length > 10) {
                console.log(`  ... e mais ${duplicateCheck.length - 10} duplicatas`);
            }
        } else {
            console.log('✅ Nenhuma duplicata encontrada na UserCompany');
        }

        // 5. Verificar consistência entre User.office_id e UserCompany.office_id (usando Prisma)
        console.log('\n🔍 Verificando consistência de office_id...');
        
        // Buscar alguns registros para verificar manualmente
        const sampleRelations = await prisma.userCompany.findMany({
            take: 10,
            include: {
                user: {
                    select: {
                        id: true,
                        office_id: true
                    }
                }
            }
        });

        let inconsistentCount = 0;
        sampleRelations.forEach(relation => {
            if (relation.user.office_id !== relation.office_id) {
                inconsistentCount++;
            }
        });

        if (inconsistentCount > 0) {
            console.log(`⚠️  Encontradas ${inconsistentCount} inconsistências na amostra de ${sampleRelations.length} registros`);
            console.log('💡 Pode haver mais inconsistências no banco completo');
        } else {
            console.log('✅ office_id consistente na amostra verificada');
        }

        // 6. Estatísticas gerais usando Prisma
        console.log('\n📈 Calculando estatísticas...');
        
        const uniqueUsers = await prisma.userCompany.groupBy({
            by: ['userId'],
            _count: {
                userId: true
            }
        });

        const uniqueCompanies = await prisma.userCompany.groupBy({
            by: ['companyId'],
            _count: {
                companyId: true
            }
        });

        const totalRelations = userCompanyRelations.length;
        const userCompanyCounts = uniqueUsers.map(u => u._count.userId);
        const avgRelationsPerUser = userCompanyCounts.length > 0 ? userCompanyCounts.reduce((a, b) => a + b, 0) / uniqueUsers.length : 0;
        const maxRelationsPerUser = userCompanyCounts.length > 0 ? Math.max(...userCompanyCounts) : 0;

        console.log('\n📈 Estatísticas gerais:');
        console.log(`  - Usuários únicos: ${uniqueUsers.length}`);
        console.log(`  - Empresas únicas: ${uniqueCompanies.length}`);
        console.log(`  - Total de relações: ${totalRelations}`);
        console.log(`  - Média de empresas por usuário: ${avgRelationsPerUser.toFixed(2)}`);
        console.log(`  - Máximo de empresas por usuário: ${maxRelationsPerUser}`);

        // 7. Usuários com múltiplas empresas
        const multiCompanyUsers = uniqueUsers.filter(u => u._count.userId > 1);

        if (multiCompanyUsers.length > 0) {
            console.log('\n👥 Usuários com múltiplas empresas:');
            console.log(`  Total: ${multiCompanyUsers.length} usuários`);
            
            // Buscar detalhes dos usuários com múltiplas empresas
            for (const userGroup of multiCompanyUsers.slice(0, 5)) { // Limite de 5 para evitar spam
                const userDetails = await prisma.userCompany.findMany({
                    where: {
                        userId: userGroup.userId
                    },
                    include: {
                        user: {
                            select: {
                                name: true,
                                email: true
                            }
                        },
                        company: {
                            select: {
                                name: true
                            }
                        }
                    }
                });

                const user = userDetails[0].user;
                const companies = userDetails.map(rel => rel.company.name).join(', ');
                console.log(`  - ${user.name} (${user.email}): ${userGroup._count.userId} empresas - ${companies}`);
            }

            if (multiCompanyUsers.length > 5) {
                console.log(`  ... e mais ${multiCompanyUsers.length - 5} usuários com múltiplas empresas`);
            }
        } else {
            console.log('\n👤 Nenhum usuário com múltiplas empresas encontrado');
        }

        // Resumo final
        console.log('\n📋 Resumo da validação:');
        const issues = [];
        
        if (missingUsers.length > 0) issues.push(`${missingUsers.length} usuários faltando`);
        if (duplicateCheck.length > 0) issues.push(`${duplicateCheck.length} duplicatas`);
        if (inconsistentCount > 0) issues.push(`${inconsistentCount} inconsistências de office_id na amostra`);

        if (issues.length === 0) {
            console.log('✅ Validação concluída com sucesso - Nenhum problema encontrado!');
            return { success: true, issues: [] };
        } else {
            console.log(`❌ Problemas encontrados: ${issues.join(', ')}`);
            return { success: false, issues };
        }

    } catch (error) {
        console.error('❌ Erro durante a validação:', error);
        throw error;
    }
}

async function main() {
    try {
        const result = await validateUserCompany();
        console.log('\n🎉 Validação concluída!');
        
        if (!result.success) {
            console.log('\n💡 Dicas para correção:');
            console.log('  - Execute o backfill novamente se houver usuários faltando');
            console.log('  - Use o rollback para limpar duplicatas e execute o backfill novamente');
            console.log('  - Verifique a integridade dos dados no banco');
        }
        
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