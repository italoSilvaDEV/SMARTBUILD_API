// SMARTBUILD_API/src/controllers/quickbooks/util/DistributedLock.ts
import { redisConnection } from "../../../queue/connection";

const DEFAULT_TTL_MS = 30000; // 30 segundos
const DEFAULT_RETRY_DELAY_MS = 100; // 100ms
const DEFAULT_MAX_RETRIES = 10;

export interface LockOptions {
  ttlMs?: number;
  retryDelayMs?: number;
  maxRetries?: number;
  gracefulOnFailure?: boolean; // Se true, permite continuar sem lock quando Redis falha
}

export class DistributedLock {
  private redis = redisConnection;
  private lockValue: string;

  constructor(private lockKey: string, private options: LockOptions = {}) {
    // Valor único para este lock (previne unlock acidental por outro processo)
    this.lockValue = `${process.pid}-${Date.now()}-${Math.random()}`;
  }

  /**
   * Tenta adquirir o lock de forma distribuída
   */
  async acquire(): Promise<boolean> {
    const {
      ttlMs = DEFAULT_TTL_MS,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      maxRetries = DEFAULT_MAX_RETRIES,
      gracefulOnFailure = true, // Default: permite continuar sem lock se Redis falhar
    } = this.options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // SET key value NX PX ttl
        // NX = only if key doesn't exist
        // PX = set expiration in milliseconds
        const result = await this.redis.set(
          this.lockKey,
          this.lockValue,
          'PX', ttlMs,
          'NX'
        );

        if (result === 'OK') {
          return true;
        }

        // Se não conseguiu adquirir o lock e ainda tem tentativas
        if (attempt < maxRetries) {
          await this.sleep(retryDelayMs);
        }
      } catch (error) {
        
        // Para erros de conexão Redis, verifica se deve falhar graciosamente
        if (attempt === maxRetries) {
          if (gracefulOnFailure) {
            return true; // Em caso de falha do Redis, permite continuar
          } else {
            throw new Error(`[DistributedLock] Lock unavailable and graceful disabled: ${this.lockKey}`);
          }
        }
        
        await this.sleep(retryDelayMs);
      }
    }

    if (gracefulOnFailure) {
      return true;
    }
    return false;
  }

  /**
   * Libera o lock de forma segura (só se foi este processo que o adquiriu)
   */
  async release(): Promise<boolean> {
    try {
      // Script Lua para garantir atomicidade:
      // Só remove se o valor do lock for igual ao nosso
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;

      const result = await this.redis.eval(script, 1, this.lockKey, this.lockValue) as number;
      
      if (result === 1) {
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Executa uma função com lock distribuído
   */
  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const acquired = await this.acquire();
    
    if (!acquired) {
      throw new Error(`Failed to acquire distributed lock: ${this.lockKey}`);
    }

    try {
      return await fn();
    } finally {
      await this.release();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Helper function para executar código com lock distribuído
 */
export async function withDistributedLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = new DistributedLock(lockKey, options);
  return lock.withLock(fn);
}

/**
 * Constantes para chaves de lock comuns
 */
export const LOCK_KEYS = {
  QB_REFRESH_TOKEN: (accountId: string) => `qb:refresh:${accountId}`,
  QB_ACCOUNT_SYNC: (companyId: string) => `qb:sync:${companyId}`,
  QB_INVOICE_SYNC: (invoiceId: string) => `qb:invoice:${invoiceId}`,
} as const;
