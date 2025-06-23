require('dotenv').config();
const { prisma } = require("../src/utils/prisma.ts");

async function testAllScripts() {
    console.log('🧪 Iniciando teste de todos os scripts UserCompany...\n');
    
    try {
        // 1. Executar validação
        console.log('1️⃣ Executando validação...');
        const { validateUserCompany } = require('./validate-user-company.js');
        const validationResult = await validateUserCompany();
        console.log(`✅ Validação concluída: ${validationResult.success ? 'SUCESSO' : 'PROBLEMAS ENCONTRADOS'}\n`);
        
        // 2. Contar registros atuais
        const currentCount = await prisma.userCompany.count();
        console.log(`2️⃣ Registros atuais na UserCompany: ${currentCount}\n`);
        
        // 3. Executar backfill (vai detectar que já existem)
        console.log('3️⃣ Executando backfill...');
        const { backfillUserCompany } = require('./backfill-user-company.js');
        await backfillUserCompany();
        console.log('✅ Backfill concluído\n');
        
        // 4. Validação final
        console.log('4️⃣ Validação final...');
        const finalValidation = await validateUserCompany();
        console.log(`✅ Validação final: ${finalValidation.success ? 'SUCESSO' : 'PROBLEMAS ENCONTRADOS'}\n`);
        
        // 5. Estatísticas finais
        const finalCount = await prisma.userCompany.count();
        const uniqueUsers = await prisma.userCompany.groupBy({
            by: ['userId'],
            _count: true
        });
        const uniqueCompanies = await prisma.userCompany.groupBy({
            by: ['companyId'],
            _count: true
        });
        
        console.log('📊 Estatísticas finais:');
        console.log(`  - Total de relações: ${finalCount}`);
        console.log(`  - Usuários únicos: ${uniqueUsers.length}`);
        console.log(`  - Empresas únicas: ${uniqueCompanies.length}`);
        
        console.log('\n🎉 Todos os scripts funcionaram corretamente!');
        console.log('\n💡 Scripts disponíveis:');
        console.log('  - node scripts/backfill-user-company.js     # Migra dados para UserCompany');
        console.log('  - node scripts/validate-user-company.js     # Valida integridade dos dados');
        console.log('  - node scripts/rollback-user-company.js all --confirm  # Remove todos os dados (CUIDADO!)');
        console.log('  - node scripts/test-all-scripts.js          # Executa este teste');
        
    } catch (error) {
        console.error('❌ Erro durante o teste:', error);
        throw error;
    }
}

async function main() {
    try {
        await testAllScripts();
    } catch (error) {
        console.error('💥 Falha no teste:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Executar apenas se chamado diretamente
if (require.main === module) {
    main();
}

module.exports = { testAllScripts }; 