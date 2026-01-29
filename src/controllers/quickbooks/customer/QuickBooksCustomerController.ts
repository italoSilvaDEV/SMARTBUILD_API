import { Request, Response } from "express";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { getQbClientOrThrow } from "../util/QuickBooksClientUtil";
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
            "Sync not allowed: Make sure it is configured to fetch customers from QuickBooks to SmartBuild.",
        });
      }

      // 2. Buscar credenciais e instanciar QuickBooks SDK
      const qb = await getQbClientOrThrow(userId, companyId);

      console.log("DEBUG: qb object created:", typeof qb);
      console.log("DEBUG: qb.findCustomers exists:", typeof qb.findCustomers);

      // 3. Buscar todos os clientes usando o método correto da biblioteca
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
