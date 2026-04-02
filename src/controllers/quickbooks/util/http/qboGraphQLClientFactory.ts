// src/controllers/quickbooks/util/http/qboGraphQLClientFactory.ts
import { makeQboGraphQLClient } from "./qboGraphQL";
import { prisma } from "../../../../utils/prisma";
import { refreshAccessToken } from "../QuickBooksTokenService";

/**
 * Creates a QuickBooks GraphQL client configured with authentication and token management.
 *
 * This factory reuses the same authentication and token refresh logic as the REST API client,
 * but is configured for GraphQL requests to the Projects API endpoint.
 *
 * @param accountId - The QuickBooks account ID
 * @returns Configured Axios instance for GraphQL requests
 *
 * @example
 * ```typescript
 * const api = qboGraphQLClientForAccount(quickBooksAccount.id);
 *
 * // Check if Projects feature is enabled
 * const query = `query CompanyPreferences {
 *   companyInfo { preferences { ProjectsEnabled } }
 * }`;
 * const { data } = await api.post('', { query });
 * console.log(data.data.companyInfo.preferences.ProjectsEnabled);
 * ```
 */
export function qboGraphQLClientForAccount(accountId: string) {
  const isProd = process.env.QUICKBOOKS_ENVIRONMENT === 'production';

  // GraphQL endpoints (different from REST v3)
  // Production: https://qb.api.intuit.com/graphql
  // Sandbox: https://qb-sandbox.api.intuit.com/graphql
  const baseURL = isProd
    ? 'https://qb.api.intuit.com/graphql'
    : 'https://qb-sandbox.api.intuit.com/graphql';

  return makeQboGraphQLClient({
    baseURL,

    getTokens: async () => {
      const acc = await prisma.quickBooksAccount.findUnique({ where: { id: accountId } });
      if (!acc) throw new Error('QuickBooks account not found');
      if (!acc.realmId) throw new Error('QuickBooks realm ID is missing');
      return {
        access: acc.accessToken,
        refresh: acc.refreshToken,
        realmId: acc.realmId,
      };
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
        refresh: r.refreshToken,
        expiresAt: r.expiresAt,
      };
    },
  });
}
