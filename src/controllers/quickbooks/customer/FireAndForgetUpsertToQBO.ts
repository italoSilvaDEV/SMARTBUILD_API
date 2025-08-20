// src/sync/fireAndForget.ts

import { QuickBooksCustomerOutboundController } from "./QuickbooksCustomerOutboundController";


const outbound = new QuickBooksCustomerOutboundController();

// chame sem await; erros são tratados internamente
export function fireAndForgetUpsertToQBO(companyId: string, userId: string, clientId: string) {
  setImmediate(async () => {
    try {
      const { created } = await outbound.upsertOneLocalClientToQBOInternal(companyId, userId, clientId);
      return created;
    } catch (e) {
      console.error("[fireAndForgetUpsertToQBO] failed:", (e as any)?.message || e);
    }

    return null;
  });
}
