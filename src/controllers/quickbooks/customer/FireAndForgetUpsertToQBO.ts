// src/sync/fireAndForget.ts

import { QuickBooksCustomerOutboundController } from "./QuickbooksCustomerOutboundController";
import { prisma } from "../../../utils/prisma";


const outbound = new QuickBooksCustomerOutboundController();

// Buffer em memória para logs de sincronização
interface SyncLogEntry {
  entity: string;
  action: string;
  entityId: string;
  companyId: string;
  details: any;
  syncExecutionId?: string | null;
}

const syncLogBuffer: Map<string, SyncLogEntry> = new Map();
const SYNC_LOG_FLUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

// Função helper para verificar se a sincronização está habilitada
async function isSyncEnabled(companyId: string, userId: string): Promise<boolean> {
  try {
    const syncPreference = await prisma.syncPreferences.findFirst({
      where: {
        companyId,
        userId,
        typesEntity: 'customers',
        isDisable: false
      }
    });
    
    return !!syncPreference;
  } catch (error) {
    console.error("[isSyncEnabled] Erro ao verificar preferências:", error);
    return false;
  }
}

// Função helper para verificar se a conta QuickBooks está ativa
async function isQuickBooksAccountActive(companyId: string, userId: string): Promise<boolean> {
  try {
    const qbAccount = await prisma.quickBooksAccount.findUnique({
      where: {
        company_id: companyId
      }
    });
    
    return !!(qbAccount && !qbAccount.isDisabled);
  } catch (error) {
    console.error("[isQuickBooksAccountActive] Erro ao verificar conta QuickBooks:", error);
    return false;
  }
}

// Função helper para criar log de sincronização (pode ser vinculado a uma execução ou avulso)
// Usa buffer em memória para reduzir carga no banco de dados
export async function createSyncLog(data: {
  entity: string;
  action: string;
  entityId: string;
  companyId: string;
  details: any;
  syncExecutionId?: string;
}) {
  try {
    // Criar chave única para evitar duplicatas
    const logKey = `${data.entity}:${data.action}:${data.entityId}`;
    
    // Adicionar ao buffer
    syncLogBuffer.set(logKey, {
      entity: data.entity,
      action: data.action,
      entityId: data.entityId,
      companyId: data.companyId,
      details: data.details,
      syncExecutionId: data.syncExecutionId || null
    });

    console.log(`[createSyncLog] Log adicionado ao buffer (total: ${syncLogBuffer.size})`);
  } catch (error) {
    console.error("[createSyncLog] Erro ao adicionar log ao buffer:", error);
  }
}

// Função para fazer batch insert dos logs do buffer
async function flushSyncLogBuffer() {
  const bufferSize = syncLogBuffer.size;  
  if (bufferSize === 0) {
    console.log("[flushSyncLogBuffer] Buffer vazio, nada para inserir");
    return;
  }

  try {
    // Converter Map para array
    const logs = Array.from(syncLogBuffer.values());
    
    console.log(`[flushSyncLogBuffer] Inserindo ${bufferSize} logs no banco...`);
    
    // Batch insert com Prisma
    await prisma.syncLog.createMany({
      data: logs,
      skipDuplicates: true
    });
    
    // Limpar buffer após inserção bem-sucedida
    syncLogBuffer.clear();
    
    console.log(`[flushSyncLogBuffer] ${bufferSize} logs inseridos com sucesso`);
  } catch (error) {
    console.error("[flushSyncLogBuffer] Erro ao inserir logs:", error);
    // Não limpa o buffer em caso de erro para não perder dados
  }
}

// Iniciar intervalo de flush automático
let flushInterval: NodeJS.Timeout | null = null;

function startSyncLogFlushInterval() {
  if (flushInterval) {
    console.log("[startSyncLogFlushInterval] Intervalo já está rodando");
    return;
  }

  flushInterval = setInterval(() => {
    flushSyncLogBuffer();
  }, SYNC_LOG_FLUSH_INTERVAL_MS);

  console.log(`[startSyncLogFlushInterval] Intervalo de flush iniciado (${SYNC_LOG_FLUSH_INTERVAL_MS}ms)`);
}

// Função para parar o intervalo (útil para testes ou shutdown)
function stopSyncLogFlushInterval() {
  if (flushInterval) {
    clearInterval(flushInterval);
    flushInterval = null;
    console.log("[stopSyncLogFlushInterval] Intervalo de flush parado");
    
    // Fazer flush final antes de parar
    flushSyncLogBuffer();
  }
}

// Iniciar o intervalo automaticamente quando o módulo é carregado
startSyncLogFlushInterval();

// chame sem await; erros são tratados internamente
export function fireAndForgetUpsertToQBO(companyId: string, userId: string, clientId: string) {
  setImmediate(async () => {
    try {
      // Verificar se a sincronização está habilitada
      const syncEnabled = await isSyncEnabled(companyId, userId);
      
      if (!syncEnabled) {
        console.log(`[fireAndForgetUpsertToQBO] Sincronização desabilitada para company=${companyId} user=${userId}`);
        
        // Log avulso (sem vinculação com execução)
        await createSyncLog({
          entity: "customers",
          action: "SkippedFireAndForget",
          entityId: clientId,
          companyId,
          details: { reason: "Sync disabled in preferences", userId }
        });
        
        return;
      }

      // Verificar se a conta QuickBooks está ativa
      const qbAccountActive = await isQuickBooksAccountActive(companyId, userId);
      
      if (!qbAccountActive) {
        console.log(`[fireAndForgetUpsertToQBO] Conta QuickBooks desabilitada para company=${companyId} user=${userId}`);
        
        // Log avulso (sem vinculação com execução)
        await createSyncLog({
          entity: "customers",
          action: "SkippedFireAndForget",
          entityId: clientId,
          companyId,
          details: { reason: "QuickBooks account is disabled", userId }
        });
        
        return;
      }
      
      const { created } = await outbound.upsertOneLocalClientToQBOInternal(companyId, userId, clientId);
      return created;
    } catch (e) {
      console.error("[fireAndForgetUpsertToQBO] failed:", (e as any)?.message || e);
      
      // Log de erro avulso
      await createSyncLog({
        entity: "customers",
        action: "ErrorFireAndForget",
        entityId: clientId,
        companyId,
        details: { error: (e as any)?.message || e, userId }
      });
    }

    return null;
  });
}

// Exportar funções de controle para uso externo (útil em testes)
export { flushSyncLogBuffer, stopSyncLogFlushInterval };