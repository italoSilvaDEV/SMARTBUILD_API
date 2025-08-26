import QuickBooks from "node-quickbooks";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "./QuickBooksTokenService";

/**
 * Busca a conta QuickBooks e retorna uma instância configurada do cliente QB
 * - Verifica se a conta existe para o usuário/empresa
 * - Renova o token se necessário
 * - Retorna instância configurada do QuickBooks SDK
 * 
 * @param userId ID do usuário
 * @param companyId ID da empresa
 * @returns Instância configurada do QuickBooks SDK
 * @throws Error se conta não encontrada ou erro no refresh do token
 */
export async function getQbClientOrThrow(userId: string, companyId: string): Promise<any> {
  // Busca account apenas por company_id (regra: uma empresa = uma conta QuickBooks)
  const quickBooksAccount = await prisma.quickBooksAccount.findUnique({
    where: { company_id: companyId },
  });
  
  if (!quickBooksAccount) {
    throw new Error("QuickBooks account not found for user/company");
  }

  if (quickBooksAccount.isDisabled) {
    throw new Error("Your QuickBooks account is disabled. Please reconnect to QuickBooks to reactivate it.");
  }

  // Refresh token se preciso
  let account = quickBooksAccount;
  if (account.expiresAt && new Date() > account.expiresAt) {
    const refreshResult = await refreshAccessToken(account.refreshToken, account.id);
    if (!refreshResult.success) {
      throw new Error("Falha ao renovar token: " + refreshResult.error);
    }
    
    const refreshed = await prisma.quickBooksAccount.findUnique({
      where: { id: account.id },
    });
    
    if (!refreshed) {
      throw new Error("QuickBooks account not found after refresh");
    }
    
    account = refreshed;
  }

  // Instancia QB SDK
  const qb = new QuickBooks(
    process.env.QUICKBOOKS_CLIENT_ID!,
    process.env.QUICKBOOKS_CLIENT_SECRET!,
    account.accessToken,
    false,
    account.realmId,
    process.env.QUICKBOOKS_ENVIRONMENT !== 'production',  // Use sandbox apenas se não for produção
    true,  // new api
    null,
    "2.0",
    account.refreshToken
  );

  return qb;
}
