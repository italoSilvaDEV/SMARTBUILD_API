require('dotenv').config();
const { prisma } = require("../src/utils/prisma.ts");

async function rollbackUserCompany() {
    console.log('🔄 Iniciando rollback UserCompany...');
    
    try {
        // 1. Contar registros antes do rollback
        const countBefore = await prisma.userCompany.count();
        console.log(`📊 Registros na UserCompany antes do rollback: ${countBefore}`);

        if (countBefore === 0) {
            console.log('✅ Nenhum registro encontrado na UserCompany. Rollback não necessário.');
            return;
        }

        // 2. Mostrar alguns exemplos dos dados que serão removidos
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
            }
        });

        console.log('\n📝 Exemplos de dados que serão removidos:');
        sampleData.forEach(relation => {
            console.log(`- ${relation.user.name} (${relation.user.email}) → ${relation.company.name} [Office: ${relation.office?.name || 'N/A'}]`);
        });

        // 3. Confirmar antes de prosseguir
        console.log('\n⚠️  ATENÇÃO: Esta operação irá remover TODOS os registros da tabela UserCompany!');
        console.log('💡 Para confirmar, execute: node scripts/rollback-user-company.js all --confirm');
        
        // Verificar se tem flag de confirmação
        const hasConfirmFlag = process.argv.includes('--confirm');
        if (!hasConfirmFlag) {
            console.log('❌ Rollback cancelado. Use --confirm para prosseguir.');
            return;
        }

        // Remover todos os registros da UserCompany
        const deleteResult = await prisma.userCompany.deleteMany({});
        
        console.log(`✅ Removidos ${deleteResult.count} registros da UserCompany`);

        // 4. Verificação final
        const countAfter = await prisma.userCompany.count();
        console.log(`📊 Registros na UserCompany após rollback: ${countAfter}`);

        if (countAfter === 0) {
            console.log('✅ Rollback concluído com sucesso!');
        } else {
            console.log(`⚠️  Ainda existem ${countAfter} registros na UserCompany`);
        }

    } catch (error) {
        console.error('❌ Erro durante o rollback:', error);
        throw error;
    }
}

async function rollbackSpecificUsers(userIds) {
    console.log(`🔄 Iniciando rollback específico para ${userIds.length} usuários...`);
    
    try {
        // Mostrar quais registros serão removidos
        const relationsToDelete = await prisma.userCompany.findMany({
            where: {
                userId: {
                    in: userIds
                }
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

        if (relationsToDelete.length === 0) {
            console.log('✅ Nenhum registro encontrado para os usuários especificados.');
            return;
        }

        console.log('\n📝 Registros que serão removidos:');
        relationsToDelete.forEach(relation => {
            console.log(`- ${relation.user.name} (${relation.user.email}) → ${relation.company.name}`);
        });

        const deleteResult = await prisma.userCompany.deleteMany({
            where: {
                userId: {
                    in: userIds
                }
            }
        });

        console.log(`✅ Removidos ${deleteResult.count} registros específicos da UserCompany`);

    } catch (error) {
        console.error('❌ Erro durante o rollback específico:', error);
        throw error;
    }
}

async function rollbackSpecificCompanies(companyIds) {
    console.log(`🔄 Iniciando rollback específico para ${companyIds.length} empresas...`);
    
    try {
        // Mostrar quais registros serão removidos
        const relationsToDelete = await prisma.userCompany.findMany({
            where: {
                companyId: {
                    in: companyIds
                }
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

        if (relationsToDelete.length === 0) {
            console.log('✅ Nenhum registro encontrado para as empresas especificadas.');
            return;
        }

        console.log('\n📝 Registros que serão removidos:');
        relationsToDelete.forEach(relation => {
            console.log(`- ${relation.user.name} (${relation.user.email}) → ${relation.company.name}`);
        });

        const deleteResult = await prisma.userCompany.deleteMany({
            where: {
                companyId: {
                    in: companyIds
                }
            }
        });

        console.log(`✅ Removidos ${deleteResult.count} registros específicos da UserCompany`);

    } catch (error) {
        console.error('❌ Erro durante o rollback específico:', error);
        throw error;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
        switch (command) {
            case 'all':
                await rollbackUserCompany();
                break;
            case 'users':
                const userIds = args.slice(1).filter(arg => !arg.startsWith('--'));
                if (userIds.length === 0) {
                    console.log('❌ Forneça os IDs dos usuários: node rollback-user-company.js users <userId1> <userId2>');
                    process.exit(1);
                }
                await rollbackSpecificUsers(userIds);
                break;
            case 'companies':
                const companyIds = args.slice(1).filter(arg => !arg.startsWith('--'));
                if (companyIds.length === 0) {
                    console.log('❌ Forneça os IDs das empresas: node rollback-user-company.js companies <companyId1> <companyId2>');
                    process.exit(1);
                }
                await rollbackSpecificCompanies(companyIds);
                break;
            default:
                console.log(`
📋 Uso do script de rollback:

  node scripts/rollback-user-company.js all --confirm                    # Remove todos os registros (REQUER --confirm)
  node scripts/rollback-user-company.js users <userId1> <userId2>        # Remove registros de usuários específicos
  node scripts/rollback-user-company.js companies <companyId1>           # Remove registros de empresas específicas

⚠️  ATENÇÃO: O comando 'all' é destrutivo e requer a flag --confirm para prosseguir.
                `);
                process.exit(1);
        }

        console.log('\n🎉 Rollback concluído com sucesso!');
    } catch (error) {
        console.error('💥 Falha no rollback:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { 
    rollbackUserCompany, 
    rollbackSpecificUsers, 
    rollbackSpecificCompanies 
}; 