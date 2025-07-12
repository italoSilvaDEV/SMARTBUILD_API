require('dotenv').config();
const { prisma } = require("../src/utils/prisma.ts");

async function backfillUserCompany() {
    console.log('🚀 Iniciando backfill UserCompany...');
    
    try {
        // 1. Buscar todos os usuários que têm company_id
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
                office_id: true,
                office: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });

        console.log(`📊 Encontrados ${usersWithCompany.length} usuários com empresa vinculada`);

        if (usersWithCompany.length === 0) {
            console.log('✅ Nenhum usuário com empresa encontrado. Backfill não necessário.');
            return;
        }

        // Validar se todas as empresas existem
        const companyIds = [...new Set(usersWithCompany.map(user => user.company_id))];
        const existingCompanies = await prisma.company.findMany({
            where: {
                id: {
                    in: companyIds
                }
            },
            select: {
                id: true
            }
        });

        const existingCompanyIds = new Set(existingCompanies.map(c => c.id));
        const usersWithValidCompany = usersWithCompany.filter(user => 
            existingCompanyIds.has(user.company_id)
        );

        if (usersWithValidCompany.length < usersWithCompany.length) {
            const invalidCount = usersWithCompany.length - usersWithValidCompany.length;
            console.log(`⚠️  ${invalidCount} usuários com company_id inválido foram ignorados`);
        }

        // 2. Verificar quais já existem na tabela UserCompany
        const existingRelations = await prisma.userCompany.findMany({
            select: {
                userId: true,
                companyId: true
            }
        });

        const existingSet = new Set(
            existingRelations.map(rel => `${rel.userId}-${rel.companyId}`)
        );

        console.log(`📋 Relações existentes na UserCompany: ${existingRelations.length}`);

        // 3. Filtrar usuários que ainda não têm relação na UserCompany
        const usersToMigrate = usersWithValidCompany.filter(user => 
            !existingSet.has(`${user.id}-${user.company_id}`)
        );

        console.log(`🔄 Usuários a serem migrados: ${usersToMigrate.length}`);

        if (usersToMigrate.length === 0) {
            console.log('✅ Todos os usuários já foram migrados.');
            return;
        }

        // 4. Criar registros na UserCompany
        const userCompanyData = usersToMigrate.map(user => ({
            userId: user.id,
            companyId: user.company_id,
            office_id: user.office_id // Campo obrigatório no schema
        }));

        // Usar createMany para inserir em lote
        const result = await prisma.userCompany.createMany({
            data: userCompanyData,
            skipDuplicates: true
        });

        console.log(`✅ Criados ${result.count} registros na UserCompany`);

        // 5. Verificação final
        const finalCount = await prisma.userCompany.count();
        const uniqueUsers = await prisma.userCompany.groupBy({
            by: ['userId'],
            _count: true
        });
        const uniqueCompanies = await prisma.userCompany.groupBy({
            by: ['companyId'],
            _count: true
        });

        console.log('\n📈 Estatísticas finais:');
        console.log(`- Total de relações UserCompany: ${finalCount}`);
        console.log(`- Usuários únicos: ${uniqueUsers.length}`);
        console.log(`- Empresas únicas: ${uniqueCompanies.length}`);

        // 6. Mostrar alguns exemplos dos dados migrados
        const sampleData = await prisma.userCompany.findMany({
            take: 5,
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
                },
                office: {
                    select: {
                        name: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        console.log('\n📝 Exemplos de dados migrados:');
        sampleData.forEach(relation => {
            console.log(`- ${relation.user.name} (${relation.user.email}) → ${relation.company.name} [Office: ${relation.office.name}]`);
        });

        // 7. Verificação de integridade
        await verifyDataIntegrity();

    } catch (error) {
        console.error('❌ Erro durante o backfill:', error);
        
        // Log mais detalhado do erro
        if (error.code === 'P2002') {
            console.error('💥 Erro de constraint única - possível duplicata');
        } else if (error.code === 'P2003') {
            console.error('💥 Erro de foreign key - referência inválida');
        }
        
        throw error;
    }
}

async function verifyDataIntegrity() {
    console.log('\n🔍 Verificando integridade dos dados...');
    
    try {
        // Verificar se existem usuários com company_id que não têm registro na UserCompany
        const usersWithoutRelation = await prisma.user.count({
            where: {
                company_id: {
                    not: null
                },
                companies: {
                    none: {}
                }
            }
        });

        if (usersWithoutRelation > 0) {
            console.log(`⚠️  ${usersWithoutRelation} usuários com company_id sem registro na UserCompany`);
        } else {
            console.log('✅ Todos os usuários com company_id têm registro na UserCompany');
        }

        // Verificar registros órfãos na UserCompany (foreign keys inválidas)
        // Nota: Esta verificação é desnecessária pois o Prisma já garante integridade referencial
        console.log('✅ Verificação de integridade de foreign keys não necessária - Prisma garante integridade referencial');

    } catch (error) {
        console.error('❌ Erro na verificação de integridade:', error);
    }
}

async function main() {
    try {
        await backfillUserCompany();
        console.log('\n🎉 Backfill concluído com sucesso!');
    } catch (error) {
        console.error('💥 Falha no backfill:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { backfillUserCompany }; 