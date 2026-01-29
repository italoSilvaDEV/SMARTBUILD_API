// src/sync/fireAndForget.ts

import { QuickBooksCustomerOutboundController } from "./QuickbooksCustomerOutboundController";
import { prisma } from "../../../utils/prisma";


const outbound = new QuickBooksCustomerOutboundController();

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
    return false;
  }
}

// Função helper para criar log de sincronização (pode ser vinculado a uma execução ou avulso)
export async function createSyncLog(data: {
  entity: string;
  action: string;
  entityId: string;
  companyId: string;
  details: any;
  syncExecutionId?: string;
}) {
  try {
    await prisma.syncLog.create({
      data: {
        entity: data.entity,
        action: data.action,
        entityId: data.entityId,
        companyId: data.companyId,
        details: data.details,
        syncExecutionId: data.syncExecutionId || null
      }
    });
  } catch (error) {
  }
}

// chame sem await; erros são tratados internamente
export function fireAndForgetUpsertToQBO(companyId: string, userId: string, clientId: string) {
  setImmediate(async () => {
    try {
      // Verificar se a sincronização está habilitada
      const syncEnabled = await isSyncEnabled(companyId, userId);
      
      if (!syncEnabled) {
        
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
