// quickbooks/util/QuickBooksTokenService.ts
import axios from "axios";
import querystring from "querystring";
import { prisma } from "../../../utils/prisma";
import { withDistributedLock, LOCK_KEYS } from "./DistributedLock";

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

// Mapa global para controlar refreshes em andamento por accountId
const refreshInProgress = new Map<string, Promise<any>>();

// Tempo de vida do cache de refresh em progresso (em ms)
const REFRESH_CACHE_TTL = 30000; // 30 segundos

/**
 * Versão robusta do refresh token que evita concorrência entre múltiplos usuários
 * Garante que apenas um refresh aconteça por vez por conta QuickBooks
 * Usa lock distribuído para funcionar através de múltiplas instâncias
 */
export async function refreshAccessToken(refreshToken: string, accountId: string) {
  // Lock distribuído combinado com cache local para máxima eficiência
  const lockKey = LOCK_KEYS.QB_REFRESH_TOKEN(accountId);
  
  // Se já há um refresh em progresso localmente, aguarda o resultado
  if (refreshInProgress.has(accountId)) {
    try {
      const result = await refreshInProgress.get(accountId)!;
      // Re-busca a conta atualizada do banco após o refresh concluído
      const updatedAccount = await prisma.quickBooksAccount.findUnique({
        where: { id: accountId }
      });
      
      if (!updatedAccount) {
        throw new Error("Account not found after concurrent refresh");
      }

      return {
        success: true as const,
        accessToken: updatedAccount.accessToken,
        refreshToken: updatedAccount.refreshToken,
        expiresAt: updatedAccount.expiresAt,
        refreshExpiresAt: updatedAccount.refreshExpiresAt,
      };
    } catch (error) {
      // Se o refresh concorrente falhou, remove da cache e tenta novamente
      refreshInProgress.delete(accountId);
    }
  }

  // Usa lock distribuído para coordenar entre múltiplas instâncias
  return withDistributedLock(
    lockKey,
    async () => {
      // Dupla verificação: outro processo pode ter feito refresh enquanto aguardávamos o lock
      const currentAccount = await prisma.quickBooksAccount.findUnique({
        where: { id: accountId }
      });

      if (!currentAccount) {
        throw new Error("QuickBooks account not found");
      }

      // Se o token ainda é válido (outro processo fez refresh), usar o atual
      const now = new Date();
      const BASE_BUFFER_MS = 5 * 60 * 1000; // 5 min base
      const JITTER_MS = stableJitterMs(accountId, 60_000); // até 1 min estável por conta
      const BUFFER_MS = BASE_BUFFER_MS + JITTER_MS;
      if (currentAccount.expiresAt && (now.getTime() + BUFFER_MS) < currentAccount.expiresAt.getTime()) {
        return {
          success: true as const,
          accessToken: currentAccount.accessToken,
          refreshToken: currentAccount.refreshToken,
          expiresAt: currentAccount.expiresAt,
          refreshExpiresAt: currentAccount.refreshExpiresAt,
        };
      }

      // Inicia um novo refresh com cache local
      if (!refreshInProgress.has(accountId)) {
        const refreshPromise = refreshAccessTokenInternal(refreshToken, accountId);
        refreshInProgress.set(accountId, refreshPromise);

        // Remove da cache após TTL ou quando concluído
        const cleanup = () => {
          setTimeout(() => {
            refreshInProgress.delete(accountId);
          }, REFRESH_CACHE_TTL);
        };

        try {
          const result = await refreshPromise;
          cleanup();
          return result;
        } catch (error) {
          cleanup();
          throw error;
        }
      } else {
        // Aguarda o refresh em progresso
        return await refreshInProgress.get(accountId)!;
      }
    },
    {
      ttlMs: 30000, // 30 segundos de lock
      maxRetries: 5, // Máximo 5 tentativas para adquirir lock
      retryDelayMs: 200, // 200ms entre tentativas
      gracefulOnFailure: true, // Permite continuar sem lock se Redis falhar
    }
  );
}

/**
 * Implementação interna do refresh token
 */
async function refreshAccessTokenInternal(refreshToken: string, accountId: string) {
  // Declara tokenUsed no escopo da função para estar disponível no catch
  let tokenUsed = refreshToken;
  
  try {
    
    // Verifica se a conta ainda existe e não foi desabilitada durante a espera
    const currentAccount = await prisma.quickBooksAccount.findUnique({
      where: { id: accountId }
    });

    if (!currentAccount) {
      throw new Error("QuickBooks account not found");
    }

    if (currentAccount.needsReauthorization) {
      throw new Error("Account needs reauthorization");
    }

    // Verificar se o refresh token já expirou antes de chamar a Intuit
    if (currentAccount.refreshExpiresAt && new Date() >= currentAccount.refreshExpiresAt) {
      // Marca reauth de forma determinística
      await prisma.quickBooksAccount.update({
        where: { id: accountId },
        data: { needsReauthorization: true },
      });
      return {
        success: false as const,
        code: "invalid_grant",
        description: "refresh token expired",
      };
    }

    const clientId = process.env.QUICKBOOKS_CLIENT_ID!;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;

    // Usa o refreshToken mais atual da conta (pode ter sido atualizado por outro processo)
    tokenUsed = currentAccount.refreshToken || refreshToken;

    const tokenResponse = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      querystring.stringify({
        grant_type: "refresh_token",
        refresh_token: tokenUsed,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        timeout: 15000, // 15 segundos timeout
      }
    );

    const {
      access_token,
      refresh_token,
      expires_in,
      x_refresh_token_expires_in,
    } = tokenResponse.data;

    const expiresAt = new Date(Date.now() + Number(expires_in) * 1000);
    const refreshExpiresAt = x_refresh_token_expires_in
      ? new Date(Date.now() + Number(x_refresh_token_expires_in) * 1000)
      : undefined;

    // Atualização atômica com verificação de versão otimista usando updateMany
    const updateResult = await prisma.quickBooksAccount.updateMany({
      where: { 
        id: accountId,
        // Garante que só atualiza se a conta não foi modificada por outro processo
        updatedAt: currentAccount.updatedAt
      },
      data: {
        accessToken: access_token,
        // refresh_token pode rotacionar; atualize apenas se vier
        ...(refresh_token ? { refreshToken: refresh_token } : {}),
        expiresAt,
        ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
        // NÃO setar updatedAt manualmente; o Prisma cuida disso com @updatedAt
        // Reset reauthorization flag se o refresh foi bem-sucedido
        needsReauthorization: false,
      },
    });

    // Se count === 0, alguém atualizou antes de nós
    if (updateResult.count === 0) {
      // Re-busque e retorne sucesso a partir do registro atual
      const latestAccount = await prisma.quickBooksAccount.findUnique({ 
        where: { id: accountId } 
      });
      
      if (!latestAccount) {
        throw new Error("QuickBooks account disappeared during refresh");
      }

      return {
        success: true as const,
        accessToken: latestAccount.accessToken,
        refreshToken: latestAccount.refreshToken,
        expiresAt: latestAccount.expiresAt,
        refreshExpiresAt: latestAccount.refreshExpiresAt,
      };
    }


    return {
      success: true as const,
      accessToken: access_token,
      refreshToken: refresh_token ?? tokenUsed,
      expiresAt,
      refreshExpiresAt,
    };
  } catch (error: any) {
    
    const status = error?.response?.status;
    const errCode = error?.response?.data?.error;
    const errDesc = error?.response?.data?.error_description;

    // Se o refresh token estiver inválido/expirado
    if (status === 400 && errCode === "invalid_grant") {
      try {
        // Só marca como needsReauthorization se não foi uma condição de corrida
        const currentAccount = await prisma.quickBooksAccount.findUnique({
          where: { id: accountId }
        });

        if (currentAccount && !currentAccount.needsReauthorization) {
          // Verifica se o token que usamos ainda é o atual (evita marcar como inválido por causa de race condition)
          const tokenStillCurrent = currentAccount.refreshToken === tokenUsed;
          
          if (tokenStillCurrent) {
            await prisma.quickBooksAccount.update({
              where: { id: accountId },
              data: { needsReauthorization: true },
            });
          } else {
          }
        }
      } catch (dbError) {
      }
    }

    // Para erros transitórios (network, timeout, rate limit), retorna erro sem marcar como invalid
    const isTransientError = 
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNABORTED' ||
      error.code === 'ETIMEDOUT' ||
      status === 429 ||
      (status && status >= 500);

    if (isTransientError) {
      return {
        success: false as const,
        code: "transient",
        description: "Network/RateLimit during token refresh. Please try again.",
      };
    }

    return {
      success: false as const,
      code: errCode || "refresh_failed",
      description: errDesc || error?.message || "Refresh failed",
    };
  }
}
