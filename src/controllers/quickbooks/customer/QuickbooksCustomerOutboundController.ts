import { Request, Response } from "express";
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { jsonSafe, deepEqual } from "./quickbooksHelpers";
import { sanitizeEmail } from "../util/sanatizeEmail";
import { uniqueDisplayName } from "../util/uniqueDisplayName";

const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 1100,
});

// aguarda 5s depois do último espelho do QBO para evitar corrida logo após o create/update
const QBO_COOLDOWN_MS = 5000;
// só empurra se o Local for pelo menos 1s mais novo que o espelho do QBO
const MIN_DELTA_MS = 1000;

export class QuickBooksCustomerOutboundController {

    private async getQbClientOrThrow(userId: string, companyId: string) {
        // Busca account
        const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
            where: { user_id: userId, company_id: companyId },
        });
        if (!quickBooksAccount) {
            throw new Error("Conta QuickBooks não encontrada para o usuário/empresa");
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
                throw new Error("Conta QuickBooks não encontrada após refresh");
            }
            account = refreshed;
        }

        // Instancia QB SDK
        const qb = new QuickBooks(
            process.env.QB_CLIENT_ID!,
            process.env.QB_CLIENT_SECRET!,
            account.accessToken,
            false,
            account.realmId,
            true,  // sandbox? troque p/ false em prod
            true,  // new api
            null,
            "2.0",
            account.refreshToken
        );

        return qb;
    }

    /**
     * Exportação inicial: cria no QBO todos os Clients que ainda NÃO têm idQuickbooks
     */
    exportMissingToQBO = async (req: Request, res: Response) => {
        const { companyId, userId } = req.params;
        try {
            const qb = await this.getQbClientOrThrow(userId, companyId);

            const clients = await prisma.client.findMany({
                where: { company_id: companyId, OR: [{ idQuickbooks: null }, { idQuickbooks: "" }] },
            });

            let created = 0;
            let errors = 0;

            for (const client of clients) {
                try {
                    // sanity de email
                    const email = sanitizeEmail(client.email);
                    const payload: any = {
                        DisplayName: uniqueDisplayName(client),
                        PrimaryEmailAddr: email ? { Address: email } : undefined,
                        PrimaryPhone: client.phone ? { FreeFormNumber: client.phone } : undefined,
                        BillAddr: client.location ? { Line1: client.location } : undefined,
                    };

                    // create
                    const result: any = await limiter.schedule(
                        () =>
                            new Promise((resolve, reject) => {
                                qb.createCustomer(payload, (err: any, data: any) => {
                                    if (err) reject(err);
                                    else resolve(data);
                                });
                            })
                    );

                    // node-quickbooks retorna o Customer "desembrulhado".
                    // Então aceite os dois formatos:
                    const customerObj = result?.Customer ?? result;
                    const newId = customerObj?.Id;
                    const newLastUpdated = customerObj?.MetaData?.LastUpdatedTime
                        ? new Date(customerObj.MetaData.LastUpdatedTime)
                        : new Date();

                    if (!newId) {
                        errors++;
                        await prisma.syncLog.create({
                            data: {
                                entity: "customers",
                                action: "Error",
                                entityId: client.id,
                                companyId,
                                details: jsonSafe({ reason: "QBO create returned without Id", raw: result, payload }),
                            },
                        });
                        continue;
                    }

                    await prisma.client.update({
                        where: { id: client.id },
                        data: { idQuickbooks: newId, quickbooksUpdatedAt: newLastUpdated },
                    });

                    await prisma.syncLog.create({
                        data: {
                            entity: "customers",
                            action: "CreatedInQBO",
                            entityId: client.id,
                            companyId,
                            details: jsonSafe({ quickbooksId: newId, lastUpdated: newLastUpdated, payload }),
                        },
                    });

                    created++;
                } catch (err: any) {
                    errors++;
                    // Erros de validação (ex.: email inválido) não derrubam o lote.
                    await prisma.syncLog.create({
                        data: {
                            entity: "customers",
                            action: "Error",
                            entityId: client.id,
                            companyId,
                            details: jsonSafe({ message: err?.Fault ?? err?.message ?? String(err) }),
                        },
                    });
                }
            }

            return res.status(200).json({ message: "Exportação inicial concluída", created, errors });
        } catch (error: any) {
            console.error("Erro na exportação inicial:", error);
            return res.status(500).json({ error: "Erro na exportação inicial", details: error.message });
        }
    };

    /**
     * Atualiza no QBO todos os Clients que já têm idQuickbooks e mudaram recentemente
     * (se quiser, filtre por data/flag)
     */
    pushLocalUpdatesToQBO = async (req: Request, res: Response) => {
        const { companyId, userId } = req.params;
        try {
            const qb = await this.getQbClientOrThrow(userId, companyId);

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

                    const qbCustomer = current?.Customer;
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
                        await prisma.syncLog.create({
                            data: {
                                entity: "customers",
                                action: "Conflict",
                                entityId: c.id,
                                companyId,
                                details: jsonSafe({
                                    reason: "Remote changed since last mirror, skipping push",
                                    qbUpdatedAt,
                                    quickbooksUpdatedAt_localMirror: c.quickbooksUpdatedAt,
                                }),
                            },
                        });
                        continue;
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
            console.error("Erro ao enviar atualizações ao QBO:", error);
            return res
                .status(500)
                .json({ error: "Erro ao enviar atualizações ao QBO", details: error.message });
        }
    }; 


     /**
   * Upsert de UM cliente local no QBO.
   * - Se não tem idQuickbooks: cria
   * - Se tem: atualiza (com checagens de conflito e no-op)
   * Retorna { created?: string; updated?: boolean }
   */
  async upsertOneLocalClientToQBOInternal(companyId: string, userId: string, clientId: string) {
    const qb = await this.getQbClientOrThrow(userId, companyId);

    const c = await prisma.client.findUnique({ where: { id: clientId } });
    if (!c || c.company_id !== companyId) {
      throw new Error("Client not found or company mismatch");
    }

    // CREATE se não tem idQuickbooks
    if (!c.idQuickbooks) {
      const email = sanitizeEmail(c.email);
      const payload: any = {
        DisplayName: uniqueDisplayName(c),
        PrimaryEmailAddr: email ? { Address: email } : undefined,
        PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
        BillAddr: c.location ? { Line1: c.location } : undefined,
      };

      const result: any = await limiter.schedule(
        () =>
          new Promise((resolve, reject) => {
            qb.createCustomer(payload, (err: any, data: any) => (err ? reject(err) : resolve(data)));
          })
      );

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
            details: jsonSafe({ reason: "QBO create returned without Id", raw: result, payload }),
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
          details: jsonSafe({ quickbooksId: newId, lastUpdated: newLastUpdated, payload }),
        },
      });

      return { created: newId, updated: false };
    }

    // UPDATE se já tem idQuickbooks
    // Cooling-off: evita push na mesma janela do create/espelho remoto
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
          qb.getCustomer(c.idQuickbooks!, (err: any, data: any) => (err ? reject(err) : resolve(data)));
        })
    );

    const qbCustomer = current?.Customer;
    if (!qbCustomer) {
      // orfão: joga para RAW e loga
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

    // Se QBO mudou desde nosso espelho local, não sobrescrever
    if (qbUpdatedAt && c.quickbooksUpdatedAt && qbUpdatedAt > c.quickbooksUpdatedAt) {
      await prisma.syncLog.create({
        data: {
          entity: "customers",
          action: "Conflict",
          entityId: c.id,
          companyId,
          details: jsonSafe({
            reason: "Remote changed since last mirror, skipping push",
            qbUpdatedAt,
            quickbooksUpdatedAt_localMirror: c.quickbooksUpdatedAt,
          }),
        },
      });
      return { created: undefined, updated: false };
    }

    const email = sanitizeEmail(c.email);
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
          qb.updateCustomer(updatePayload, (err: any, data: any) => (err ? reject(err) : resolve(data)));
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
