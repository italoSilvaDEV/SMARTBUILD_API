// src/controllers/quickbooks/webhook/QuickBooksWebhookWorker.ts
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { sanitizeEmail } from "../util/sanatizeEmail";
import { jsonSafe } from "../customer/quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

const limiter = new Bottleneck({ maxConcurrent: 1, minTime: 1100 });

// helper no topo do arquivo (ou antes do uso)
export function extractCustomer(data: any) {
  // 1) Resposta clássica do node-quickbooks para getCustomer
  if (data?.Customer) return data.Customer;
  // 2) Resposta de consulta (query)
  if (data?.QueryResponse?.Customer?.[0]) return data.QueryResponse.Customer[0];
  // 3) Alguns ambientes já retornam o próprio Customer "achatado"
  if (data && typeof data === "object" && data.Id && data.DisplayName) return data;
  return null;
}

export class QuickBooksWebhookWorker {
  static async process(payload: any) {
    const notifs = payload?.eventNotifications ?? [];
    for (const notif of notifs) {
      const realmId: string | undefined = notif?.realmId;
      const entities = notif?.dataChangeEvent?.entities ?? [];
      if (!realmId) continue;

      // Encontre a conta QBO pelo realmId
      const account = await prisma.quickBooksAccount.findFirst({ where: { realmId } });
      if (!account) {
        console.warn("[QBO Webhook] nenhuma conta local para realmId:", realmId);
        continue;
      }

      // Verificar se a conta está desabilitada
      if (account.isDisabled) {
        console.log(`[QBO Webhook] Conta QuickBooks desabilitada para realmId=${realmId}, ignorando webhook`);
        continue;
      }

      // Garanta token válido
      const qb = await this.getQBForAccount(account);

      // Descubra a company_id para salvar no Client
      const companyId = account.company_id;

      if (!companyId) {
        console.warn("[QBO Webhook] Conta sem company_id, ignorando evento");
        continue;
      }

      if (!account.user_id) {
        console.warn("[QBO Webhook] Conta sem user_id, ignorando evento");
        continue;
      }

      // Verificar se a sincronização está habilitada para esta empresa
      const syncEnabled = await this.isSyncEnabledForCompany(companyId, account.user_id);
      if (!syncEnabled) {
        console.log(`[QBO Webhook] Sincronização desabilitada para company=${companyId} user=${account.user_id}`);
        continue;
      }

      // Filtre somente Customer events
      const customerEvents = entities.filter((e: any) => e.name?.toLowerCase() === "customer");
      for (const evt of customerEvents) {
        const id = evt.id;
        const op = (evt.operation || "").toLowerCase(); // create | update | delete | merge ...

        try {
          if (op === "delete") {
            // QBO marca como inativo; se quiser, sincronize um flag local
            await this.handleDeleteCustomer(companyId, id);
            continue;
          }

          // Para create/update/merge: busque o Customer completo
          const current: any = await limiter.schedule(
            () =>
              new Promise((resolve, reject) => {
                qb.getCustomer(id, (err: any, data: any) => (err ? reject(err) : resolve(data)));
              })
          );
          
          // O SDK às vezes retorna em formatos diferentes
          const qbCustomer = extractCustomer(current);
          
          if (!qbCustomer) {
            console.warn(
              "[QBO Webhook] Customer não encontrado ao buscar detalhes:",
              id,
              "shape:", JSON.stringify(Object.keys(current || {}))
            );
            continue;
          }
 
          await this.upsertCustomerFromQBO(companyId, qbCustomer);
        } catch (e: any) {
          console.error("[QBO Webhook] erro entity:", id, e?.message || e);
          await createSyncLog({
            entity: "customers",
            action: "WebhookError",
            entityId: id,
            companyId,
            details: jsonSafe({ message: e?.message || String(e), op }),
          });
        }
      }
    }
  }

  private static async getQBForAccount(account: any) {
    // refresh se preciso
    let acc = account;
    if (acc.expiresAt && new Date() > acc.expiresAt) {
      const r = await refreshAccessToken(acc.refreshToken, acc.user_id);
      if (!r.success) throw new Error("Falha ao renovar token: " + r.error);
      // re-carrega
      acc = await prisma.quickBooksAccount.findUnique({ where: { id: acc.id } });
      if (!acc) throw new Error("Conta QuickBooks não encontrada após refresh");
    }

    const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID;
    const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET;

    return new QuickBooks(
      QB_CLIENT_ID!,
      QB_CLIENT_SECRET!,
      acc.accessToken,
      false,
      acc.realmId,
      process.env.QUICKBOOKS_ENVIRONMENT !== 'production',   // Use sandbox apenas se não for produção
      true,   // new api
      null,
      "2.0",
      acc.refreshToken
    );
  }

  private static async upsertCustomerFromQBO(companyId: string, qbCustomer: any) {
    const qbId: string | undefined = qbCustomer.Id;
    const emailFromQb = sanitizeEmail(qbCustomer.PrimaryEmailAddr?.Address || undefined) || undefined;
    const qbUpdatedAt = qbCustomer.MetaData?.LastUpdatedTime ? new Date(qbCustomer.MetaData.LastUpdatedTime) : null;

    if (!qbId) return;

    // 1) Tente por idQuickbooks
    const byId = await prisma.client.findFirst({
      where: { company_id: companyId, idQuickbooks: qbId },
    });

    const mapFromQb = (local?: any) => ({
      name: qbCustomer.DisplayName,
      email: emailFromQb ?? local?.email ?? null,
      document: qbCustomer.TaxIdentifier || null,
      phone: qbCustomer.PrimaryPhone?.FreeFormNumber || null,
      city_and_state: qbCustomer.BillAddr
        ? `${qbCustomer.BillAddr.City || ""}, ${qbCustomer.BillAddr.CountrySubDivisionCode || ""}`.trim()
        : null,
      birth_date: qbCustomer.BirthDate || null,
      location: qbCustomer.BillAddr?.Line1 || null,
      idQuickbooks: qbId,
      quickbooksUpdatedAt: qbUpdatedAt ?? new Date(),
      sync_version: local ? (local.sync_version || 0) + 1 : 0,
      company_id: companyId,
      avatar: local?.avatar || null,
      lat: local?.lat || null,
      log: local?.log || null,
      radius: local?.radius || null,
      autorId: local?.autorId || null,
      stripeCustomerId: local?.stripeCustomerId || null,
    });

    if (byId) {
      // só atualiza se o remoto for mais novo que nosso espelho
      const lastSeenRemote = byId.quickbooksUpdatedAt ?? new Date(0);
      if (qbUpdatedAt && qbUpdatedAt > lastSeenRemote) {
        const data = mapFromQb(byId);
        await prisma.client.update({ where: { id: byId.id }, data });
        await createSyncLog({
          entity: "customers",
          action: "UpdatedFromWebhook",
          entityId: byId.id,
          companyId,
          details: jsonSafe({ reason: "QBO newer via webhook", qbId, qbUpdatedAt }),
        });
      }
      return;
    }

    // 2) Não temos idQuickbooks local — tente achar por e-mail
    if (!emailFromQb) {
      await createSyncLog({
        entity: "customers",
        action: "WebhookSkipped",
        entityId: qbId,
        companyId,
        details: jsonSafe({ reason: "Missing email from QBO" }),
      });
      return;
    }

    const existingByEmail = await prisma.client.findFirst({
      where: { company_id: companyId, email: emailFromQb },
    });

    if (existingByEmail) {
      // linka o idQuickbooks e atualiza campos vindos do QBO
      const data = mapFromQb(existingByEmail);
      await prisma.client.update({ where: { id: existingByEmail.id }, data });
      await createSyncLog({
        entity: "customers",
        action: "LinkedAndUpdatedFromWebhook",
        entityId: existingByEmail.id,
        companyId,
        details: jsonSafe({ reason: "Matched by email", qbId, email: emailFromQb }),
      });
      return;
    }

    // 3) Criar novo local
    const created = await prisma.client.create({ data: mapFromQb() });
    await createSyncLog({
      entity: "customers",
      action: "InsertedFromWebhook",
      entityId: created.id,
      companyId,
      details: jsonSafe({ qbId, email: emailFromQb }),
    });
  }

  private static async handleDeleteCustomer(companyId: string, qbId: string) {
    // QBO não hard-deleta; a operação vem como Delete. Você pode marcar localmente (ex.: flag “inactive”).
    // Aqui, só logamos.
    await createSyncLog({
      entity: "customers",
      action: "WebhookDelete",
      entityId: qbId,
      companyId,
      details: jsonSafe({ qbId }), // <- antes estava objeto puro
    });
  }

  // Função helper para verificar se a sincronização está habilitada para uma empresa
  private static async isSyncEnabledForCompany(companyId: string, userId: string): Promise<boolean> {
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
      console.error("[isSyncEnabledForCompany] Erro ao verificar preferências:", error);
      return false;
    }
  }
}
