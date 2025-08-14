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
    console.error("[isSyncEnabled] Erro ao verificar preferências:", error);
    return false;
  }
}

// chame sem await; erros são tratados internamente
export function fireAndForgetUpsertToQBO(companyId: string, userId: string, clientId: string) {
  setImmediate(async () => {
    try {
      // Verificar se a sincronização está habilitada
      const syncEnabled = await isSyncEnabled(companyId, userId);
      
      if (!syncEnabled) {
        console.log(`[fireAndForgetUpsertToQBO] Sincronização desabilitada para company=${companyId} user=${userId}`);
        return;
      }
      
      await outbound.upsertOneLocalClientToQBOInternal(companyId, userId, clientId);
    } catch (e) {
      console.error("[fireAndForgetUpsertToQBO] failed:", (e as any)?.message || e);
    }
  });
}
