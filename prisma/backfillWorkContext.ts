/// <reference types="node" />
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Tentar carregar variáveis de ambiente de diferentes locais
const envPaths = [
  resolve(__dirname, '../.env'),
  resolve(process.cwd(), '.env'),
  resolve(__dirname, '../.env.local'),
];

let envLoaded = false;
for (const envPath of envPaths) {
  if (existsSync(envPath)) {
    config({ path: envPath });
    console.log(`✓ Variáveis de ambiente carregadas de: ${envPath}\n`);
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn('  Arquivo .env não encontrado. Tentando usar variáveis de ambiente do sistema...\n');
  config(); // Tenta carregar do diretório atual como fallback
}

// Verificar se DATABASE_URL está disponível
if (!process.env.DATABASE_URL) {
  console.error(' DATABASE_URL não encontrada!');
  console.error('\n Crie um arquivo .env na raiz do projeto com:');
  console.error('DATABASE_URL="mysql://usuario:senha@localhost:3306/nome_do_banco"\n');
  process.exit(1);
}

import { prisma } from "../src/utils/prisma";

interface ProjectGroup {
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  companyId: string | null;
  projectCount: number;
  projects: {
    id: string;
    location: string | null;
    lat: string | null;
    log: string | null;
    radius: number | null;
  }[];
}

async function main() {
  console.log(' Iniciando backfill de WorkContext...\n');

  // ETAPA 1: BUSCAR PROJETOS E DADOS DOS CLIENTES
  // =============================================
  // Esta query busca todos os projetos que têm um cliente vinculado,
  // incluindo dados do cliente (nome, email, phone, company_id) e 
  // informações de localização do projeto (location, lat, log, radius)
  const projects = await prisma.project.findMany({
    where: {
      client_id: {
        not: null
      }
    },
    select: {
      id: true,
      client_id: true,
      location: true,
      lat: true,
      log: true,
      radius: true,
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          company_id: true
        }
      }
    },
    orderBy: {
      date_creation: 'asc' // Ordena do mais antigo ao mais novo
    }
  });

  console.log(` Total de projetos encontrados: ${projects.length}\n`);

  // ETAPA 2: AGRUPAR PROJETOS POR CLIENTE
  // ======================================
  // Agrupamos todos os projetos pelo cliente para saber:
  // - Quantos projetos cada cliente tem
  // - Quais são os dados de localização de cada projeto
  const projectsByClient = new Map<string, ProjectGroup>();

  for (const project of projects) {
    if (!project.client_id || !project.client) continue;

    // Se o cliente ainda não está no Map, adiciona com suas informações
    if (!projectsByClient.has(project.client_id)) {
      projectsByClient.set(project.client_id, {
        clientId: project.client_id,
        clientName: project.client.name,
        clientEmail: project.client.email,
        clientPhone: project.client.phone,
        companyId: project.client.company_id,
        projectCount: 0,
        projects: []
      });
    }

    // Adiciona o projeto à lista do cliente
    const group = projectsByClient.get(project.client_id)!;
    group.projectCount++;
    group.projects.push({
      id: project.id,
      location: project.location,
      lat: project.lat,
      log: project.log,
      radius: project.radius
    });
  }

  console.log(` Total de clientes únicos: ${projectsByClient.size}\n`);

  // ETAPA 3: PROCESSAR CADA CLIENTE E CRIAR WORKCONTEXT
  // ====================================================
  let processedClients = 0;
  let createdContexts = 0;
  let skippedContexts = 0;
  let skippedNoCompany = 0;

  for (const [clientId, group] of projectsByClient.entries()) {
    processedClients++;

    // VALIDAÇÃO: Cliente precisa ter company_id (campo obrigatório no WorkContext)
    if (!group.companyId) {
      console.log(`  Cliente "${group.clientName}" não possui company_id. Pulando...`);
      skippedNoCompany++;
      continue;
    }

    // VERIFICAR SE JÁ EXISTE WORKCONTEXT
    // ===================================
    // Esta query verifica se já foi criado um WorkContext para este cliente
    // Isso torna o script idempotente (pode rodar várias vezes sem duplicar dados)
    const existingContext = await prisma.workContext.findFirst({
      where: {
        clientId: clientId
      }
    });

    if (existingContext) {
      console.log(`⏭  Cliente "${group.clientName}" já possui WorkContext. Pulando...`);
      
      // GARANTIR VINCULAÇÃO DOS PROJETOS
      // =================================
      // Mesmo que o WorkContext já exista, garante que todos os projetos
      // deste cliente estão vinculados a ele (caso algum tenha sido criado depois)
      await prisma.project.updateMany({
        where: {
          client_id: clientId,
          workContextId: null
        },
        data: {
          workContextId: existingContext.id
        }
      });
      
      skippedContexts++;
      continue;
    }

    // CRIAR NOVO WORKCONTEXT
    // ======================
    const isMultipleProjects = group.projectCount > 1;
    
    // Pegar o primeiro projeto para extrair dados de localização (se houver apenas 1)
    const firstProject = group.projects[0];
    
    // Estrutura básica do WorkContext com campos obrigatórios
    const workContextData: any = {
      clientId: clientId,
      companyId: group.companyId, // Campo obrigatório
      type: 'PERSONAL', // Tipo padrão (pode ser COMPANY ou PERSONAL)
      label: null, // Label para identificar contextos migrados
      isActive: true,
      
      // Dados do cliente
      Name: group.clientName,
      Email: group.clientEmail,
      phone: group.clientPhone
    };

    // LÓGICA: 1 PROJETO = COPIA ENDEREÇO | 2+ PROJETOS = SEM ENDEREÇO
    // ================================================================
    // Se o cliente tem apenas 1 projeto, copiamos os dados de localização desse projeto
    // Se tem 2 ou mais projetos, criamos um WorkContext "vazio" (sem endereço)
    // porque não sabemos qual endereço usar
    if (!isMultipleProjects && firstProject) {
      // COPIAR LATITUDE/LONGITUDE
      // =========================
      // Converter lat/log de String para Decimal
      if (firstProject.lat && firstProject.log) {
        try {
          workContextData.latitude = parseFloat(firstProject.lat);
          workContextData.longitude = parseFloat(firstProject.log);
        } catch (e) {
          console.warn(`  Erro ao converter lat/log para o cliente "${group.clientName}"`);
        }
      }

      // COPIAR RADIUS
      // =============
      if (firstProject.radius) {
        workContextData.radius = firstProject.radius;
      }

      // COPIAR LOCATION (campo de texto livre)
      // =======================================
      if (firstProject.location) {
        // workContextData.location = firstProject.location;
        workContextData.addressOffice = firstProject.location; // Copiar também para addressOffice
        workContextData.notes = `Localização migrada do projeto: ${firstProject.location}`;
      }

      console.log(` Cliente "${group.clientName}" com 1 projeto - criando WorkContext COM endereço`);
    } else {
      console.log(` Cliente "${group.clientName}" com ${group.projectCount} projetos - criando WorkContext SEM endereço`);
    }

    // INSERIR NO BANCO (INSERT)
    // ==========================
    // Cria o registro na tabela work_context
    const newContext = await prisma.workContext.create({
      data: workContextData
    });

    createdContexts++;

    // ETAPA 4: VINCULAR PROJETOS AO WORKCONTEXT (UPDATE)
    // ===================================================
    // Atualiza TODOS os projetos deste cliente para apontarem
    // para o WorkContext recém-criado (preenche a FK workContextId)
    await prisma.project.updateMany({
      where: {
        client_id: clientId
      },
      data: {
        workContextId: newContext.id
      }
    });

    console.log(` ${group.projectCount} projeto(s) vinculado(s) ao WorkContext\n`);
  }

  // ETAPA 5: RESUMO FINAL
  // =====================
  // Exibe estatísticas sobre o que foi processado
  console.log('\n' + '='.repeat(60));
  console.log(' RESUMO DO BACKFILL');
  console.log('='.repeat(60));
  console.log(`Total de clientes processados: ${processedClients}`);
  console.log(`WorkContexts criados: ${createdContexts}`);
  console.log(`WorkContexts já existentes (pulados): ${skippedContexts}`);
  console.log(`Clientes sem company_id (pulados): ${skippedNoCompany}`);
  console.log('='.repeat(60));
  console.log('\n Backfill concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('\n Erro durante o backfill:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

