import QuickBooks from "node-quickbooks";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "./QuickBooksTokenService";

// Função para determinar se deve marcar needsReauthorization
function shouldRequireReauthorization(err: any): boolean {
  const status = err?.status || err?.response?.status;
  const code = err?.code || err?.response?.data?.error;
  const desc = err?.response?.data?.error_description || "";
  
  return (
    status === 401 ||
    status === 403 ||
    code === "invalid_grant" ||
    /invalid_token|token expired|reauthoriz/i.test(String(desc))
  );
}

// Função para gerar jitter estável baseado em hash determinístico
function stableJitterMs(input: string, maxMs = 60_000): number {
  // hash simples determinístico
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) - h) + input.charCodeAt(i);
    h |= 0;
  }
  // 0..maxMs-1
  const positive = Math.abs(h);
  return positive % maxMs;
}

/**
 * Busca a conta QuickBooks e retorna uma instância configurada do cliente QB
 * - Verifica se a conta existe para o usuário/empresa
 * - Renova o token se necessário com proteção contra concorrência
 * - Retorna instância configurada do QuickBooks SDK
 * - Inclui fallback robusto para cenários de erro
 * 
 * @param userId ID do usuário
 * @param companyId ID da empresa
 * @returns Instância configurada do QuickBooks SDK
 * @throws Error se conta não encontrada ou erro no refresh do token
 */
export async function getQbClientOrThrow(userId: string, companyId: string): Promise<any> {
  // Busca account apenas por company_id (regra: uma empresa = uma conta QuickBooks)
  let quickBooksAccount = await prisma.quickBooksAccount.findUnique({
    where: { company_id: companyId },
  });
  
  if (!quickBooksAccount) {
    throw new Error("QuickBooks account not found for user/company");
  }

  if (quickBooksAccount.isDisabled) {
    throw new Error("Your QuickBooks account is disabled. Please reconnect to QuickBooks to reactivate it.");
  }

  if (quickBooksAccount.needsReauthorization) {
    throw new Error("QuickBooks account needs reauthorization. Please reconnect your QuickBooks account.");
  }

  // Buffer de tempo com jitter estável para evitar thundering herd
  const BASE_BUFFER_MS = 5 * 60 * 1000; // 5 min base
  const JITTER_MS = stableJitterMs(quickBooksAccount.id, 60_000); // até 1 min estável por conta
  const REFRESH_BUFFER_MS = BASE_BUFFER_MS + JITTER_MS;

  const now = new Date();
  const shouldRefresh = quickBooksAccount.expiresAt &&
    (now.getTime() + REFRESH_BUFFER_MS) > quickBooksAccount.expiresAt.getTime();

  // Refresh token se preciso com proteção robusta
  let account = quickBooksAccount;
  if (shouldRefresh) {
    try {
      
      const refreshResult = await refreshAccessToken(account.refreshToken, account.id);
      if (!refreshResult.success) {
        // Se o refresh falhou, verifica se é erro de autorização usando função padronizada
        const simulatedAxiosLike = {
          response: { status: 400, data: { error: refreshResult.code, error_description: refreshResult.description } },
          code: refreshResult.code,
        };
        if (shouldRequireReauthorization(simulatedAxiosLike)) {
          throw new Error("QuickBooks account needs reauthorization. Please reconnect your QuickBooks account.");
        }

        // Para outros erros, tenta usar o token existente se ainda válido
        if (quickBooksAccount.expiresAt && now < quickBooksAccount.expiresAt) {
          account = quickBooksAccount;
        } else {
          throw new Error(`Failed to refresh QuickBooks token: ${refreshResult.description}`);
        }
      } else {
        // Re-busca a conta atualizada após refresh bem-sucedido
        const refreshed = await prisma.quickBooksAccount.findUnique({
          where: { id: account.id },
        });
        
        if (!refreshed) {
          throw new Error("QuickBooks account not found after refresh");
        }
        
        account = refreshed;
      }
    } catch (error: any) {
      // Se o erro é de autorização, propaga direto usando função padronizada
      if (shouldRequireReauthorization(error)) {
        throw error;
      }
      
      // Para outros erros, tenta usar token existente se ainda válido (com buffer simétrico)
      if (quickBooksAccount.expiresAt && now < quickBooksAccount.expiresAt) {
        account = quickBooksAccount;
      } else {
        throw new Error(`Failed to prepare QuickBooks client: ${error.message}`);
      }
    }
  }

  // Validações finais do token
  if (!account.accessToken) {
    throw new Error("QuickBooks access token is missing");
  }

  if (!account.realmId) {
    throw new Error("QuickBooks realm ID is missing");
  }

  // Recalcula 'now' depois do refresh para evitar falsos positivos de expiração
  const currentTime = new Date();
  if (account.expiresAt && currentTime >= account.expiresAt) {
    throw new Error("QuickBooks access token has expired and refresh failed");
  }

  try {


    // Deixar undefined para usar o comportamento padrão mais recente da API
    const MINOR_VERSION = undefined;


    
    // Instancia QB SDK com configurações robustas
    const qb = new QuickBooks(
      process.env.QUICKBOOKS_CLIENT_ID!,
      process.env.QUICKBOOKS_CLIENT_SECRET!,
      account.accessToken,
      false, // não usar OAuth1
      account.realmId,
      process.env.QUICKBOOKS_ENVIRONMENT !== 'production', // Use sandbox apenas se não for produção
      true, // usar nova API
      MINOR_VERSION, // undefined = usa default mais recente (75+ em 2025)
      "2.0", // versão da API
      account.refreshToken
    );

    return qb;
  } catch (error: any) {
    throw new Error(`Failed to create QuickBooks client: ${error.message}`);
  }
}

/**
 * Versão alternativa que retorna tanto o cliente QB quanto os dados da conta
 * Útil para casos onde você precisa acessar informações da conta (como realmId)
 */
export async function getQbClientWithAccountOrThrow(userId: string, companyId: string): Promise<{ qb: any; account: any }> {
  const qb = await getQbClientOrThrow(userId, companyId);
  
  // Re-busca a conta para garantir dados atualizados
  const account = await prisma.quickBooksAccount.findUnique({
    where: { company_id: companyId },
  });
  
  if (!account) {
    throw new Error("QuickBooks account not found after client creation");
  }
  
  return { qb, account };
}
