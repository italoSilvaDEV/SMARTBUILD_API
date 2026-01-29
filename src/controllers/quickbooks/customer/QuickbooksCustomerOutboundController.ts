import { Request, Response } from "express";
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { getQbClientOrThrow } from "../util/QuickBooksClientUtil";
import { jsonSafe, deepEqual } from "./quickbooksHelpers";
import { sanitizeEmail } from "../util/sanatizeEmail";
import { baseDisplayName, isDuplicateNameError, withSuffix } from "../util/uniqueDisplayName";
import { createSyncLog } from "./FireAndForgetUpsertToQBO";
import { extractCustomer } from "../webhook/QuickBooksWebhookWorker";

/** Shape mínimo para evitar "namespace QuickBooks como tipo" */
type QuickBooksLike = {
  batch: (items: any[], cb: (err: any, data: any) => void) => void;
};

/**
 * Parâmetros de batch e rate limit
 *
 * - BATCH_SIZE_TRY: tentamos 30 itens por batch (recomendado pelos materiais mais novos da Intuit)
 * - BATCH_SIZE_FALLBACK: se o endpoint recusar 30, caímos para 10
 * - BATCH_PAUSE_MS: ~1500ms para caber no teto de ~40 batches/min por realm
 * - MAX_RETRIES: re-tenta batch em 429/erros transitórios
 */

const BATCH_SIZE_TRY = 30;
const BATCH_SIZE_FALLBACK = 10;
const BATCH_PAUSE_MS = 1500;
const MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Stats de telemetria para visibilidade */
type BatchStats = {
  triedSize: number;
  usedFallback: boolean;
  batchesAtTried: number;
  batchesAtFallback: number;
  totalBatches: number;
  duplicatesFoundRound1: number;
  duplicatesRetriedRound2: number;
};
function newStats(triedSize: number): BatchStats {
  return {
    triedSize,
    usedFallback: false,
    batchesAtTried: 0,
    batchesAtFallback: 0,
    totalBatches: 0,
    duplicatesFoundRound1: 0,
    duplicatesRetriedRound2: 0,
  };
}


/**
 * Tenta extrair, de um erro, um Retry-After em segundos (ou ms padrão).
 */
function retryAfterMsFromErr(err: any) {
  try {
    const headers =
      err?.response?.headers ||
      err?.headers ||
      err?.request?.res?.headers ||
      {};
    const ra = headers["retry-after"] ?? headers["Retry-After"];
    const n = Number(ra);
    if (Number.isFinite(n) && n > 0) return n * 1000;
  } catch {}
  return 5000; // fallback
}

/** Erro de “batch grande demais”? Divide em 10 */
function isBatchTooLargeError(err: any): boolean {
  const parts: string[] = [];
  if (err?.message) parts.push(String(err.message));
  if (err?.Message) parts.push(String(err.Message));
  if (err?.detail) parts.push(String(err.detail));
  if (err?.Detail) parts.push(String(err.Detail));
  const arrs = [
    err?.Fault?.Error,
    err?.fault?.Error,
    err?.fault?.error,
    err?.response?.data?.Fault?.Error,
  ].filter(Array.isArray) as any[][];
  for (const a of arrs) for (const e of a) {
    if (e?.Detail) parts.push(String(e.Detail));
    if (e?.Message) parts.push(String(e.Message));
  }
  const txt = parts.join(" | ").toLowerCase();
  return /too many|max(imum)? (operations|items)|batch item limit|exceeded/.test(txt);
}

/**
 * Constrói o payload Customer para create/update.
 */
function buildCustomerPayload(client: any, displayName: string) {
  const email = sanitizeEmail(client.email);
  return {
    DisplayName: displayName,
    PrimaryEmailAddr: email ? { Address: email } : undefined,
    PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
    BillAddr: client.location ? { Line1: client.location } : undefined,
  };
}


/**
 * Executa qb.batch com retries e respeito a Retry-After (quando 429).
 * Retorna a resposta (data) ou lança erro final.
 */
async function runBatchWithRetry(
  qb: QuickBooksLike,
  batchItems: any[],
  attempt = 1
): Promise<any> {
  try {
    const data: any = await new Promise((resolve, reject) => {
      qb.batch(batchItems, (err: any, resp: any) => (err ? reject(err) : resolve(resp)));
    });
    return data;
  } catch (err: any) {
    const status = err?.status || err?.response?.status || err?.code;

    if (status === 429 && attempt <= MAX_RETRIES) {
      const waitMs = retryAfterMsFromErr(err);
      await sleep(waitMs);
      return runBatchWithRetry(qb, batchItems, attempt + 1);
    }

    if (String(status).startsWith("5") && attempt <= MAX_RETRIES) {
      const waitMs = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s...
      await sleep(waitMs);
      return runBatchWithRetry(qb, batchItems, attempt + 1);
    }

    throw err;
  }
}

/** Detecção robusta de 6240 (Fault/fault/item) */
function isDupNameFaultLoose(obj: any): boolean {
  if (!obj) return false;
  if (isDuplicateNameError(obj)) return true; // seu helper original

  // caminhos extras
  const candidates = [
    obj?.Fault, obj?.fault, obj?.error, obj?.Error, obj,
    obj?.response?.data, obj?.response?.data?.Fault, obj?.response?.data?.fault,
  ].filter(Boolean);

  for (const c of candidates) {
    if (isDuplicateNameError(c)) return true;
    const arrs = [c?.Error, c?.error].filter(Array.isArray) as any[][];
    for (const arr of arrs) {
      for (const e of arr) {
        if (String(e?.code) === "6240") return true;
        const t = [e?.Message, e?.message, e?.Detail, e?.detail].filter(Boolean).join(" ").toLowerCase();
        if (t.includes("duplicate name")) return true;
      }
    }
    const txt = [c?.Message, c?.message, c?.Detail, c?.detail]
      .filter(Boolean).map(String).join(" ").toLowerCase();
    if (txt.includes("duplicate name")) return true;
  }
  return false;
}

/**
 * Processa um conjunto de clientes em batch, criando SEM sufixo (useSuffix=false) OU COM sufixo (useSuffix=true).
 * - Retorna:
 *    - createdCount
 *    - errorCount
 *    - duplicateClients: clientes que falharam por "duplicate name" (só é relevante quando useSuffix=false)
 * Processa clientes em batch (sem sufixo OU com sufixo) e atualiza stats.
 */
async function processClientsBatch(
  qb: QuickBooksLike,
  clients: any[],
  companyId: string,
  syncExecutionId: string | undefined,
  useSuffix: boolean,
  batchSize: number,
  stats: BatchStats,
  isRound2 = false
): Promise<{ createdCount: number; errorCount: number; duplicateClients: any[] }> {
  let createdCount = 0;
  let errorCount = 0;
  const duplicateClients: any[] = [];

  for (let i = 0; i < clients.length; i += batchSize) {
    const slice = clients.slice(i, i + batchSize);

    const batchItems = slice.map((client) => {
      const baseName = baseDisplayName(client);
      const displayName = useSuffix ? withSuffix(baseName, client) : baseName;
      return {
        bId: `c_${client.id}${useSuffix ? "_suf" : ""}`,
        operation: "create",
        Customer: buildCustomerPayload(client, displayName),
      };
    });

    let resp: any;
    try {
      resp = await runBatchWithRetry(qb, batchItems);
      if (batchSize === BATCH_SIZE_TRY) stats.batchesAtTried++;
      if (batchSize === BATCH_SIZE_FALLBACK) stats.batchesAtFallback++;
      stats.totalBatches++;
    } catch (err: any) {
      if (isBatchTooLargeError(err) && batchSize > BATCH_SIZE_FALLBACK) {
        // fallback em tempo de execução
        stats.usedFallback = true;
        for (let j = 0; j < slice.length; j += BATCH_SIZE_FALLBACK) {
          const sub = slice.slice(j, j + BATCH_SIZE_FALLBACK);
          const subRes = await processClientsBatch(
            qb, sub, companyId, syncExecutionId, useSuffix, BATCH_SIZE_FALLBACK, stats, isRound2
          );
          createdCount += subRes.createdCount;
          errorCount += subRes.errorCount;
          duplicateClients.push(...subRes.duplicateClients);
          await sleep(BATCH_PAUSE_MS);
        }
        continue;
      } else {
        // Falha “total” do batch: log por item
        for (const client of slice) {
          errorCount++;
          await createSyncLog({
            entity: "customers",
            action: "Error",
            entityId: client.id,
            companyId,
            details: jsonSafe({ message: err?.Fault ?? err?.message ?? String(err) }),
            syncExecutionId,
          });
        }
        await sleep(BATCH_PAUSE_MS);
        continue;
      }
    }

    const items = resp?.BatchItemResponse ?? [];
    for (const item of items) {
      const bId = String(item?.bId || "");
      const fault = item?.Fault ?? item?.fault ?? item?.error ?? null;
      const okCustomer = item?.Customer;
      const isSuccess = !!okCustomer?.Id;

      const clientId = bId.startsWith("c_") ? bId.substring(2).replace(/_suf$/, "") : "";
      const client = slice.find((c) => c.id === clientId) || null;

      if (isSuccess) {
        const newId = okCustomer.Id;
        const newLastUpdated = okCustomer?.MetaData?.LastUpdatedTime
          ? new Date(okCustomer.MetaData.LastUpdatedTime)
          : new Date();

        try {
          await prisma.client.update({
            where: { id: clientId },
            data: { idQuickbooks: newId, quickbooksUpdatedAt: newLastUpdated },
          });

          await createSyncLog({
            entity: "customers",
            action: "CreatedInQBO",
            entityId: clientId,
            companyId,
            details: jsonSafe({
              quickbooksId: newId,
              lastUpdated: newLastUpdated,
              usedSuffix: useSuffix === true,
            }),
            syncExecutionId,
          });

          createdCount++;
        } catch (errUpdate: any) {
          errorCount++;
          await createSyncLog({
            entity: "customers",
            action: "Error",
            entityId: clientId,
            companyId,
            details: jsonSafe({
              reason: "Failed to update local DB after QBO success",
              quickbooksId: okCustomer?.Id,
              error: errUpdate?.message || String(errUpdate),
            }),
            syncExecutionId,
          });
        }
      } else {
        if (client) {
          const dup = !useSuffix && isDupNameFaultLoose(fault || item);
          if (dup) {
            stats.duplicatesFoundRound1++;
            duplicateClients.push(client); // vai pro round-2
          } else {
            errorCount++;
            await createSyncLog({
              entity: "customers",
              action: "Error",
              entityId: client.id,
              companyId,
              details: jsonSafe({
                message:
                  fault?.Error?.[0]?.Detail ||
                  fault?.Error?.[0]?.Message ||
                  fault?.message ||
                  "Batch item failed",
                fault,
                usedSuffix: useSuffix === true,
                round: isRound2 ? "round2" : "round1",
              }),
              syncExecutionId,
            });
          }
        } else {
          errorCount++;
          await createSyncLog({
            entity: "customers",
            action: "Error",
            entityId: clientId || "unknown",
            companyId,
            details: jsonSafe({
              message: "Batch item failed and client not found in slice",
              fault,
              usedSuffix: useSuffix === true,
              round: isRound2 ? "round2" : "round1",
            }),
            syncExecutionId,
          });
        }
      }
    }

    await sleep(BATCH_PAUSE_MS); // ~40 batches/min
  }

  return { createdCount, errorCount, duplicateClients };
}





const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100,
});

// aguarda 5s depois do último espelho do QBO para evitar corrida logo após o create/update
const QBO_COOLDOWN_MS = 5000;
// só empurra se o Local for pelo menos 1s mais novo que o espelho do QBO
const MIN_DELTA_MS = 1000;

export class QuickBooksCustomerOutboundController {

  /**
   * Exportação inicial: cria no QBO todos os Clients que ainda NÃO têm idQuickbooks (com BATCH)
   * - 1ª rodada: cria sem sufixo
   * - Reprocessa duplicados: cria com sufixo
   * - Atualiza prisma.client e escreve createSyncLog igual sua lógica atual
   * - Respeita limites com pausa entre batches e retries em 429
   */
 

  exportMissingToQBO = async (req: Request, res: Response) => {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId;

    try {
      const qb = (await getQbClientOrThrow(userId, companyId)) as unknown as QuickBooksLike;

      const clients = await prisma.client.findMany({
        where: { company_id: companyId, OR: [{ idQuickbooks: null }, { idQuickbooks: "" }] },
        orderBy: { date_creation: "asc" },
      });

      if (clients.length === 0) {
        return res.status(200).json({
          message: "Não há clientes pendentes para exportar",
          created: 0,
          errors: 0,
          batchStats: newStats(BATCH_SIZE_TRY),
        });
      }

      const stats = newStats(BATCH_SIZE_TRY);
      let created = 0;
      let errors = 0;

      // ===== Round 1: SEM sufixo =====
      const r1 = await processClientsBatch(
        qb, clients, companyId, syncExecutionId,
        /* useSuffix */ false, BATCH_SIZE_TRY, stats, /* isRound2 */ false
      );
      created += r1.createdCount;
      errors += r1.errorCount;

      // ===== Round 2: apenas duplicados, COM sufixo =====
      if (r1.duplicateClients.length > 0) {
        stats.duplicatesRetriedRound2 = r1.duplicateClients.length;
        const r2 = await processClientsBatch(
          qb, r1.duplicateClients, companyId, syncExecutionId,
          /* useSuffix */ true, BATCH_SIZE_TRY, stats, /* isRound2 */ true
        );
        created += r2.createdCount;
        errors += r2.errorCount;
      }

      return res.status(200).json({
        message: "Exportação inicial concluída (batch)",
        created,
        errors,
        batchStats: stats,
      });
    } catch (error: any) {
      // console.error(" Erro na exportação inicial (batch):", error);
      // console.error(" Erro detalhado:", {
      //   message: error?.message,
      //   fault: error?.Fault,
      //   code: error?.code,
      //   status: error?.status,
      //   stack: error?.stack,
      // });

      return res.status(500).json({
        error: "Erro na exportação inicial",
        details: error?.Fault || error?.message || "Erro desconhecido",
        debugInfo: {
          environment: process.env.QUICKBOOKS_ENVIRONMENT || "sandbox",
        },
      });
    }
  };
 
 
 
  /**
   * Atualiza no QBO todos os Clients que já têm idQuickbooks e mudaram recentemente
   * (se quiser, filtre por data/flag)
   */
  pushLocalUpdatesToQBO = async (req: Request, res: Response) => {
    const { companyId, userId } = req.params;
    try {
      const qb = await getQbClientOrThrow(userId, companyId);

      const clients = await prisma.client.findMany({
        where: { company_id: companyId, NOT: [{ idQuickbooks: null }, { idQuickbooks: "" }] },
      });

      let updatedCount = 0;

      for (const c of clients) {
        try {
          // 0) Proteções antes de chamar o QBO:
          //    a) janela de resfriamento depois do último espelho remoto
          //    b) Local precisa ser realmente mais novo que o espelho (com margem)

          const now = new Date();
          const lastRemote = c.quickbooksUpdatedAt ?? new Date(0);

          // a) cooling-off
          const stillCooling =
            c.quickbooksUpdatedAt &&
            now.getTime() - lastRemote.getTime() < QBO_COOLDOWN_MS;

          if (stillCooling) {
            await prisma.syncLog.create({
              data: {
                entity: "customers",
                action: "Skipped",
                entityId: c.id,
                companyId,
                details: jsonSafe({
                  reason: `CoolingOff (${QBO_COOLDOWN_MS}ms) after last QBO mirror`,
                  lastRemote,
                  now,
                }),
              },
            });
            continue;
          }

          // b) delta mínimo (Local precisa ser > 1s mais novo)
          const localNewer = c.date_update.getTime() - lastRemote.getTime() > MIN_DELTA_MS;

          if (!localNewer) {
            await prisma.syncLog.create({
              data: {
                entity: "customers",
                action: "Skipped",
                entityId: c.id,
                companyId,
                details: jsonSafe({
                  reason: "Local not newer than last QBO mirror",
                  date_update: c.date_update,
                  lastRemote,
                  minDeltaMs: MIN_DELTA_MS,
                }),
              },
            });
            continue;
          }

          // 1) Busca o atual no QBO (pegar SyncToken e validar existência)
          const current: any = await limiter.schedule(
            () =>
              new Promise<any>((resolve, reject) => {
                qb.getCustomer(c.idQuickbooks, (err: any, data: any) =>
                  err ? reject(err) : resolve(data)
                );
              })
          );

          const qbCustomer = extractCustomer(current);
          if (!qbCustomer) {
            await prisma.quickBooksCustomerRaw.create({
              data: {
                companyId,
                clientId: c.id,
                quickbooksId: c.idQuickbooks,
                reason: "NotFoundInQBO",
                payload: jsonSafe(c),
                status: "IGNORED",
              },
            });

            await prisma.syncLog.create({
              data: {
                entity: "customers",
                action: "OrphanDetected",
                entityId: c.id,
                companyId,
                details: jsonSafe({
                  reason:
                    "QBO customer not found for idQuickbooks — moved to QuickBooksCustomerRaw",
                  idQuickbooks: c.idQuickbooks,
                }),
              },
            });
            continue;
          }

          const qbUpdatedAt = qbCustomer.MetaData?.LastUpdatedTime
            ? new Date(qbCustomer.MetaData.LastUpdatedTime)
            : null;

          // 2) Conflito: remoto mudou desde o seu espelho local
          if (qbUpdatedAt && c.quickbooksUpdatedAt && qbUpdatedAt > c.quickbooksUpdatedAt) {
            // Verifica se a atualização local é mais nova que a do QBO
            if (c.date_update > qbUpdatedAt) {
              // Local é mais novo - deve atualizar o QBO mesmo com divergência no espelho
              await prisma.syncLog.create({
                data: {
                  entity: "customers",
                  action: "Info",
                  entityId: c.id,
                  companyId,
                  details: jsonSafe({
                    reason: "Local newer than QBO despite mirror divergence, proceeding with update",
                    qbUpdatedAt,
                    quickbooksUpdatedAt_localMirror: c.quickbooksUpdatedAt,
                    date_update: c.date_update,
                  }),
                },
              });
              // Continua para fazer o update
            } else {
              // QBO é mais novo que o local - conflito real
              await prisma.syncLog.create({
                data: {
                  entity: "customers",
                  action: "Conflict",
                  entityId: c.id,
                  companyId,
                  details: jsonSafe({
                    reason: "QBO is newer than local changes, skipping push",
                    qbUpdatedAt,
                    quickbooksUpdatedAt_localMirror: c.quickbooksUpdatedAt,
                    date_update: c.date_update,
                  }),
                },
              });
              continue;
            }
          }

          // 3) Payload controlado por você
          const email = c.email?.trim();
          const updatePayload = {
            Id: qbCustomer.Id,
            SyncToken: qbCustomer.SyncToken,
            DisplayName: c.name,
            PrimaryEmailAddr: email ? { Address: email } : undefined,
            PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
            BillAddr: c.location
              ? {
                Line1: c.location,
                City: c.city_and_state?.split(",")[0]?.trim() || undefined,
                CountrySubDivisionCode: c.city_and_state?.split(",")[1]?.trim() || undefined,
              }
              : undefined,
          };

          // 4) No-op check
          const normalizedLocal = {
            DisplayName: updatePayload.DisplayName ?? null,
            Email: updatePayload.PrimaryEmailAddr?.Address ?? null,
            Phone: updatePayload.PrimaryPhone?.FreeFormNumber ?? null,
            Line1: updatePayload.BillAddr?.Line1 ?? null,
            City: updatePayload.BillAddr?.City ?? null,
            CountrySubDivisionCode: updatePayload.BillAddr?.CountrySubDivisionCode ?? null,
          };

          const normalizedQbo = {
            DisplayName: qbCustomer.DisplayName ?? null,
            Email: qbCustomer.PrimaryEmailAddr?.Address ?? null,
            Phone: qbCustomer.PrimaryPhone?.FreeFormNumber ?? null,
            Line1: qbCustomer.BillAddr?.Line1 ?? null,
            City: qbCustomer.BillAddr?.City ?? null,
            CountrySubDivisionCode: qbCustomer.BillAddr?.CountrySubDivisionCode ?? null,
          };

          if (deepEqual(normalizedLocal, normalizedQbo)) {
            await prisma.syncLog.create({
              data: {
                entity: "customers",
                action: "Skipped",
                entityId: c.id,
                companyId,
                details: jsonSafe({
                  reason: "No-op (same content)",
                  normalizedLocal,
                  normalizedQbo,
                }),
              },
            });
            continue;
          }

          // 5) Atualiza no QBO
          const updated: any = await limiter.schedule(
            () =>
              new Promise<any>((resolve, reject) => {
                qb.updateCustomer(updatePayload, (err: any, data: any) =>
                  err ? reject(err) : resolve(data)
                );
              })
          );

          updatedCount++;

          // 6) Atualiza espelho local
          const updatedLast = updated?.Customer?.MetaData?.LastUpdatedTime
            ? new Date(updated.Customer.MetaData.LastUpdatedTime)
            : new Date();

          await prisma.client.update({
            where: { id: c.id },
            data: { quickbooksUpdatedAt: updatedLast },
          });

          await prisma.syncLog.create({
            data: {
              entity: "customers",
              action: "UpdatedInQBO",
              entityId: c.id,
              companyId,
              details: jsonSafe({
                before: normalizedQbo,
                pushed: normalizedLocal,
                result: {
                  Id: updated?.Customer?.Id,
                  SyncToken: updated?.Customer?.SyncToken,
                  lastUpdated: updatedLast,
                },
              }),
            },
          });
        } catch (err: any) {
          await prisma.syncLog.create({
            data: {
              entity: "customers",
              action: "ErrorPushToQBO",
              entityId: c.id,
              companyId,
              details: jsonSafe({
                message: err?.message || String(err),
                idQuickbooks: c.idQuickbooks,
              }),
            },
          });
        }
      }

      return res.status(200).json({ message: "Push to QBO finished", updated: updatedCount });
    } catch (error: any) {
      // console.error(" Erro ao enviar atualizações ao QBO:", error);
      // console.error(" Erro detalhado no push:", {
        message: error?.message,
        fault: error?.Fault,
        code: error?.code,
        status: error?.status,
        stack: error?.stack
      });

      return res
        .status(500)
        .json({
          error: "Erro ao enviar atualizações ao QBO",
          details: error?.Fault || error?.message || "Erro desconhecido",
          debugInfo: {
            environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox'
          }
        });
    }
  };


  /**
   * Upsert de UM cliente local no QBO.
   * - Se não tem idQuickbooks: cria
   *   -> tenta SEM sufixo; se der "Duplicate Name", tenta COM sufixo
   * - Se tem: atualiza (com checagens de conflito e no-op)
   * Retorna { created?: string; updated?: boolean }
   */
  async upsertOneLocalClientToQBOInternal(companyId: string, userId: string, clientId: string) {
    const qb = await getQbClientOrThrow(userId, companyId);

    const c = await prisma.client.findUnique({ where: { id: clientId } });
    if (!c || c.company_id !== companyId) {
      throw new Error("Client not found or company mismatch");
    }

    // CREATE se não tem idQuickbooks
    if (!c.idQuickbooks) {
      const email = sanitizeEmail(c.email);
      const display = baseDisplayName(c);

      const buildPayload = (displayName: string) => ({
        DisplayName: displayName,
        PrimaryEmailAddr: email ? { Address: email } : undefined,
        PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
        BillAddr: c.location ? { Line1: c.location } : undefined,
      });

      let result: any;
      try {
        // 1) tenta criar SEM sufixo
        result = await limiter.schedule(
          () =>
            new Promise((resolve, reject) => {
              qb.createCustomer(buildPayload(display), (err: any, data: any) =>
                err ? reject(err) : resolve(data)
              );
            })
        );
      } catch (err: any) {
        // 2) se nome duplicado, tenta novamente COM sufixo
        if (isDuplicateNameError(err)) {
          const displayWithSuffix = withSuffix(display, c);
          result = await limiter.schedule(
            () =>
              new Promise((resolve, reject) => {
                qb.createCustomer(buildPayload(displayWithSuffix), (e: any, data: any) =>
                  e ? reject(e) : resolve(data)
                );
              })
          );
        } else {
          // outros erros seguem o fluxo padrão
          await prisma.syncLog.create({
            data: {
              entity: "customers",
              action: "Error",
              entityId: c.id,
              companyId,
              details: jsonSafe({ message: err?.Fault ?? err?.message ?? String(err) }),
            },
          });
          return { created: undefined, updated: false };
        }
      }

      const customerObj = result?.Customer ?? result;
      const newId = customerObj?.Id;
      const newLastUpdated = customerObj?.MetaData?.LastUpdatedTime
        ? new Date(customerObj.MetaData.LastUpdatedTime)
        : new Date();

      if (!newId) {
        await prisma.syncLog.create({
          data: {
            entity: "customers",
            action: "Error",
            entityId: c.id,
            companyId,
            details: jsonSafe({ reason: "QBO create returned without Id", raw: result }),
          },
        });
        return { created: undefined, updated: false };
      }

      await prisma.client.update({
        where: { id: c.id },
        data: { idQuickbooks: newId, quickbooksUpdatedAt: newLastUpdated },
      });

      await prisma.syncLog.create({
        data: {
          entity: "customers",
          action: "CreatedInQBO",
          entityId: c.id,
          companyId,
          details: jsonSafe({
            quickbooksId: newId,
            lastUpdated: newLastUpdated,
            displayNameUsed: customerObj?.DisplayName ?? display,
          }),
        },
      });

      return { created: newId, updated: false };
    }

    // UPDATE se já tem idQuickbooks (mantém sua lógica atual)
    const lastRemote = c.quickbooksUpdatedAt ?? new Date(0);
    const localNewer = c.date_update > new Date(lastRemote.getTime() + 3000); // 3s
    if (!localNewer) {
      await prisma.syncLog.create({
        data: {
          entity: "customers",
          action: "Skipped",
          entityId: c.id,
          companyId,
          details: jsonSafe({
            reason: "Local not newer than last QBO mirror (cooling-off)",
            date_update: c.date_update,
            lastRemote,
          }),
        },
      });
      return { created: undefined, updated: false };
    }

    const current: any = await limiter.schedule(
      () =>
        new Promise((resolve, reject) => {
          qb.getCustomer(c.idQuickbooks!, (err: any, data: any) =>
            err ? reject(err) : resolve(data)
          );
        })
    );

    const qbCustomer = extractCustomer(current);
    if (!qbCustomer) {
      await prisma.quickBooksCustomerRaw.create({
        data: {
          companyId,
          quickbooksId: c.idQuickbooks,
          reason: "NotFoundInQBO",
          payload: jsonSafe({ clientId: c.id, email: c.email, name: c.name }),
          status: "IGNORED",
        },
      });
      await prisma.syncLog.create({
        data: {
          entity: "customers",
          action: "OrphanDetected",
          entityId: c.id,
          companyId,
          details: jsonSafe({
            reason: "QBO customer not found for idQuickbooks — moved to QuickBooksCustomerRaw",
            idQuickbooks: c.idQuickbooks,
          }),
        },
      });
      return { created: undefined, updated: false };
    }

    const qbUpdatedAt = qbCustomer.MetaData?.LastUpdatedTime
      ? new Date(qbCustomer.MetaData.LastUpdatedTime)
      : null;

    if (qbUpdatedAt && c.quickbooksUpdatedAt && qbUpdatedAt > c.quickbooksUpdatedAt) {
      // Verifica se a atualização local é mais nova que a do QBO
      if (c.date_update > qbUpdatedAt) {
        // Local é mais novo - deve atualizar o QBO mesmo com divergência no espelho
        await prisma.syncLog.create({
          data: {
            entity: "customers",
            action: "Info",
            entityId: c.id,
            companyId,
            details: jsonSafe({
              reason: "Local newer than QBO despite mirror divergence, proceeding with update",
              qbUpdatedAt,
              quickbooksUpdatedAt_localMirror: c.quickbooksUpdatedAt,
              date_update: c.date_update,
            }),
          },
        });
        // Continua para fazer o update
      } else {
        // QBO é mais novo que o local - conflito real
        await prisma.syncLog.create({
          data: {
            entity: "customers",
            action: "Conflict",
            entityId: c.id,
            companyId,
            details: jsonSafe({
              reason: "QBO is newer than local changes, skipping push",
              qbUpdatedAt,
              quickbooksUpdatedAt_localMirror: c.quickbooksUpdatedAt,
              date_update: c.date_update,
            }),
          },
        });
        return { created: undefined, updated: false };
      }
    }

    const email = sanitizeEmail(c.email);
    const updatePayload = {
      Id: qbCustomer.Id,
      SyncToken: qbCustomer.SyncToken,
      DisplayName: c.name, // mantém como está; se quiser, pode usar baseDisplayName(c)
      PrimaryEmailAddr: email ? { Address: email } : undefined,
      PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
      BillAddr: c.location
        ? {
          Line1: c.location,
          City: c.city_and_state?.split(",")[0]?.trim() || undefined,
          CountrySubDivisionCode: c.city_and_state?.split(",")[1]?.trim() || undefined,
        }
        : undefined,
    };

    const normalizedLocal = {
      DisplayName: updatePayload.DisplayName ?? null,
      Email: updatePayload.PrimaryEmailAddr?.Address ?? null,
      Phone: updatePayload.PrimaryPhone?.FreeFormNumber ?? null,
      Line1: updatePayload.BillAddr?.Line1 ?? null,
      City: updatePayload.BillAddr?.City ?? null,
      CountrySubDivisionCode: updatePayload.BillAddr?.CountrySubDivisionCode ?? null,
    };
    const normalizedQbo = {
      DisplayName: qbCustomer.DisplayName ?? null,
      Email: qbCustomer.PrimaryEmailAddr?.Address ?? null,
      Phone: qbCustomer.PrimaryPhone?.FreeFormNumber ?? null,
      Line1: qbCustomer.BillAddr?.Line1 ?? null,
      City: qbCustomer.BillAddr?.City ?? null,
      CountrySubDivisionCode: qbCustomer.BillAddr?.CountrySubDivisionCode ?? null,
    };

    if (deepEqual(normalizedLocal, normalizedQbo)) {
      await prisma.syncLog.create({
        data: {
          entity: "customers",
          action: "Skipped",
          entityId: c.id,
          companyId,
          details: jsonSafe({ reason: "No-op (same content)", normalizedLocal, normalizedQbo }),
        },
      });
      return { created: undefined, updated: false };
    }

    const updated: any = await limiter.schedule(
      () =>
        new Promise((resolve, reject) => {
          qb.updateCustomer(updatePayload, (err: any, data: any) =>
            err ? reject(err) : resolve(data)
          );
        })
    );

    const updatedLast = updated?.Customer?.MetaData?.LastUpdatedTime
      ? new Date(updated.Customer.MetaData.LastUpdatedTime)
      : new Date();

    await prisma.client.update({
      where: { id: c.id },
      data: { quickbooksUpdatedAt: updatedLast },
    });

    await prisma.syncLog.create({
      data: {
        entity: "customers",
        action: "UpdatedInQBO",
        entityId: c.id,
        companyId,
        details: jsonSafe({
          before: normalizedQbo,
          pushed: normalizedLocal,
          result: { Id: updated?.Customer?.Id, SyncToken: updated?.Customer?.SyncToken, lastUpdated: updatedLast },
        }),
      },
    });

    return { created: undefined, updated: true };
  }

}
