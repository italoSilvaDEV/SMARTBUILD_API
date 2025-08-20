import { Request, Response } from "express";
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { jsonSafe } from "./quickbooksHelpers";
import { createSyncLog } from "../customer/FireAndForgetUpsertToQBO";

// Rate limiter para evitar erro 429 da API QuickBooks
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100, // 1,1s para respeitar o limite real da Intuit (máx. 500 req/hora)
});

export class QuickBooksClientController {
  async syncClients(req: Request, res: Response) {
    const { companyId, userId } = req.params;
    const syncExecutionId = (req as any).syncExecutionId; // ID da execução se vier do orchestrator

    if (!userId) {
      return res.status(400).json({ error: "User ID não fornecido" });
    }

    if (!companyId) {
      return res.status(400).json({ error: "Company ID não fornecido" });
    }

    try {
      // 1. Verificar SyncPreferences antes de tudo
      const syncPref = await prisma.syncPreferences.findFirst({
        where: {
          companyId,
          userId,
          typesEntity: "customers",
          typeSync: { in: ['QuickBooksToSmartBuild', 'bidirectional'] },
        },
      });

      if (!syncPref) {
        return res.status(403).json({
          error:
            "Sincronização não permitida: verifique se está configurada para buscar clientes do QuickBooks para SmartBuild.",
        });
      }

      // 2. Buscar credenciais do QuickBooksAccount pelo userId E companyId (garante que está no contexto certo)
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: {
          user_id: userId,
          company_id: companyId,
        },
      });

      if (!quickBooksAccount) {
        return res
          .status(404)
          .json({ error: "Conta QuickBooks não encontrada para o usuário/empresa" });
      }

      // 3. Verificar se o accessToken expirou e refresh se necessário
      let account = quickBooksAccount;
      if (account.expiresAt && new Date() > account.expiresAt) {
        const refreshResult = await refreshAccessToken(account.refreshToken, account.id);
        if (!refreshResult.success) {
          return res.status(401).json({ error: "Falha ao renovar token: " + refreshResult.error });
        }
        // Buscar o account atualizado pós-refresh
        const refreshed = await prisma.quickBooksAccount.findUnique({
          where: { id: account.id },
        });
        if (!refreshed) {
          return res
            .status(404)
            .json({ error: "Conta QuickBooks não encontrada após refresh" });
        }
        account = refreshed; // aqui garantimos que 'account' nunca será null
      }

      // 4. Instanciar QuickBooks SDK corretamente
      const qb = new QuickBooks(
        process.env.QUICKBOOKS_CLIENT_ID!,
        process.env.QUICKBOOKS_CLIENT_SECRET!,
        account.accessToken,
        false, // Não é tokenSecret (usar OAuth2)
        account.realmId,
        process.env.QUICKBOOKS_ENVIRONMENT !== 'production', // true usa sandbox, false produção
        true, // Use the new API
        null,
        "2.0",
        account.refreshToken
      );

      console.log("DEBUG: qb object created:", typeof qb);
      console.log("DEBUG: qb.findCustomers exists:", typeof qb.findCustomers);

      // 5. Buscar todos os clientes usando o método correto da biblioteca
      console.log("DEBUG: Buscando clientes com findCustomers...");

      const result: any = await limiter.schedule(() =>
        new Promise((resolve, reject) => {
          qb.findCustomers({ fetchAll: true }, (err: any, data: any) => {
            if (err) {
              console.error("QBO ERROR DETALHADO:", JSON.stringify(err, null, 2));
              console.error("QBO ERROR Fault:", err?.Fault);
              console.error("QBO ERROR Message:", err?.message);
              console.error("QBO ERROR Code:", err?.code);
              console.error("QBO ERROR Status:", err?.status);
              reject(err);
            } else {
              console.log(" Clientes encontrados:", data?.QueryResponse?.Customer?.length || 0);
              resolve(data);
            }
          });
        })
      );

      const allClients = result.QueryResponse?.Customer || [];

      let totalSynced = 0;
     

      // Helpers
      const stashRaw = async (qbCust: any, reason: string, status = "NEW") => {
        await prisma.quickBooksCustomerRaw.create({
          data: {
            companyId,
            quickbooksId: qbCust?.Id ?? null,
            payload: qbCust ?? {},
            reason,
            status,
          },
        });
      };

      const mapFromQb = (qbClient: any, localClient?: any) => {
        const qbUpdatedAt =
          qbClient.MetaData?.LastUpdatedTime ? new Date(qbClient.MetaData.LastUpdatedTime) : null;
      
        return {
          name: qbClient.DisplayName,
          email: qbClient.PrimaryEmailAddr?.Address ?? localClient?.email,
          document: qbClient.TaxIdentifier || null,
          phone: qbClient.PrimaryPhone?.FreeFormNumber || null,
          city_and_state: qbClient.BillAddr
            ? `${qbClient.BillAddr.City || ""}, ${qbClient.BillAddr.CountrySubDivisionCode || ""}`.trim()
            : null,
          birth_date: qbClient.BirthDate || null,
          location: qbClient.BillAddr?.Line1 || null,
      
          //  NÃO setar date_update (ele é @updatedAt)
          //  Setar o espelho do QBO
          quickbooksUpdatedAt: qbUpdatedAt,
      
          idQuickbooks: qbClient.Id,
          sync_version: localClient ? (localClient.sync_version || 0) + 1 : 0,
          avatar: localClient?.avatar || null,
          lat: localClient?.lat || null,
          log: localClient?.log || null,
          radius: localClient?.radius || null,
          autorId: localClient?.autorId || userId,
          stripeCustomerId: localClient?.stripeCustomerId || null,
          company_id: companyId,
        };
      };

      for (const qbClient of allClients) {
        const qbId = qbClient.Id as string | undefined;
        const emailFromQb: string | undefined = qbClient.PrimaryEmailAddr?.Address;
     
        if (qbId) {
          const byId = await prisma.client.findFirst({
            where: { company_id: companyId, idQuickbooks: qbId },
          });
        
          if (byId) {
            const qbUpdatedAt = qbClient.MetaData?.LastUpdatedTime
              ? new Date(qbClient.MetaData.LastUpdatedTime)
              : null;
        
            // Agora comparamos com o espelho salvo, NÃO com date_update
            const lastSeenRemote = byId.quickbooksUpdatedAt ?? new Date(0);
        
            if (qbUpdatedAt && qbUpdatedAt > lastSeenRemote) {
              const data = mapFromQb(qbClient, byId);
              await prisma.client.update({ where: { id: byId.id }, data });
              await createSyncLog({
                entity: "customers",
                action: "Updated",
                entityId: byId.id,
                companyId,
                details: jsonSafe({ reason: "QBO newer", oldData: byId, newData: data }),
                syncExecutionId
              });
              totalSynced++;
            } else {
              await createSyncLog({
                entity: "customers",
                action: "Skipped",
                entityId: byId.id,
                companyId,
                details: jsonSafe({ reason: "QBO not newer than local mirror", qbUpdatedAt, lastSeenRemote }),
                syncExecutionId
              });
            }
            continue; // já resolvido por idQuickbooks
          }
        }

        // 2) Não há link por idQuickbooks — agora depende do e-mail
        if (!emailFromQb) {
          await stashRaw(qbClient, "MISSING_EMAIL");
          await createSyncLog({
            entity: "customers",
            action: "Skipped",
            entityId: qbId ?? "unknown",
            companyId,
            details: jsonSafe({ reason: "Missing email from QBO" }),
            syncExecutionId
          });
          continue;
        }

        // Verifica se já existe cliente local por e-mail (unicidade por company)
        const existingByEmail = await prisma.client.findFirst({
          where: { company_id: companyId, email: emailFromQb },
        });

        if (existingByEmail) {
          // Não sobrescreve por e-mail; manda para staging
          await stashRaw(qbClient, "DUPLICATE_EMAIL");
          await createSyncLog({
            entity: "customers",
            action: "Skipped",
            entityId: existingByEmail.id,
            companyId,
            details: jsonSafe({ reason: "Duplicate email on Local; stashed to RAW", email: emailFromQb }),
            syncExecutionId
          });
          continue;
        }

        // 3) Pode criar novo Client com esse email e gravar idQuickbooks
        const data = mapFromQb(qbClient);
        const newClient = await prisma.client.create({ data });
        await createSyncLog({
          entity: "customers",
          action: "Inserted",
          entityId: newClient.id,
          companyId,
          details: jsonSafe(data),
          syncExecutionId
        });
        totalSynced++;
      }

      res.status(200).json({ message: "Sincronização concluída", synced: totalSynced });


    } catch (error: any) {
      console.error(" Erro na sincronização de clientes:", error);
      console.error(" Erro detalhado:", {
        message: error?.message,
        fault: error?.Fault,
        code: error?.code,
        status: error?.status,
        stack: error?.stack
      });
      
      res.status(500).json({ 
        error: "Erro interno na sincronização", 
        details: error?.Fault || error?.message || "Erro desconhecido",
        debugInfo: {
          environment: process.env.QUICKBOOKS_ENVIRONMENT || 'sandbox'
        }
      });
    }
  }
}
