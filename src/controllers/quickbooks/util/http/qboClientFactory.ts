// src/modules/quickbooks/http/qboClientFactory.ts
import { makeQboClient } from "./qbohttp";
import { prisma } from "../../../../utils/prisma";
import { refreshAccessToken } from "../QuickBooksTokenService";

export function qboClientForAccount(accountId: string) {
  const isProd = process.env.QUICKBOOKS_ENVIRONMENT === 'production';
  const baseURL = isProd
    ? 'https://quickbooks.api.intuit.com/v3/company'
    : 'https://sandbox-quickbooks.api.intuit.com/v3/company';
  return makeQboClient({
    baseURL,
    getTokens: async () => {
      const acc = await prisma.quickBooksAccount.findUnique({ where: { id: accountId } });
      if (!acc) throw new Error('QuickBooks account not found');
      return { access: acc.accessToken, refresh: acc.refreshToken, realmId: acc.realmId };
    },
    saveTokens: async ({ access, refresh, expiresAt }) => {
      await prisma.quickBooksAccount.update({
        where: { id: accountId },
        data: {
          accessToken: access,
          ...(refresh ? { refreshToken: refresh } : {}),
          ...(expiresAt ? { expiresAt } : {}),
          updatedAt: new Date(),
        },
      });
    },
    refreshTokens: async (refreshToken: string) => {
      const r = await refreshAccessToken(refreshToken, accountId);
      if (!r.success) return { ok: false as const, error: r.error ?? 'unknown' };
      return {
        ok: true as const,
        access: r.accessToken,
        refresh: r.refreshToken,  // pode rotacionar!
        expiresAt: r.expiresAt,   // expiração do access token
      };
    },
  });
}


//   como usar 
// const api = qboClientForAccount(quickBooksAccount.id);

// // Ex.: validar Accounting
// const { data } = await api.get(`/companyinfo/${quickBooksAccount.realmId}`);

// // Ex.: query
// const query = "select * from Customer startposition 1 maxresults 1000";
// const r = await api.get(`/query`, { params: { query } });