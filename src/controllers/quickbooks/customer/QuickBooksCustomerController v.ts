import { Request, Response } from "express";
import QuickBooks from "node-quickbooks";
import Bottleneck from "bottleneck";
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "../util/QuickBooksTokenService";

// Rate limiter para evitar erro 429 da API QuickBooks
const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1100, // 1,1s para respeitar o limite real da Intuit (máx. 500 req/hora)
});

export class QuickBooksClientController {
  async syncClients(req: Request, res: Response) {
    const { companyId, userId } = req.params;

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
          typeSync: "QuickBooksToSmartBuild",
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
        const refreshResult = await refreshAccessToken(account.refreshToken, userId);
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
        process.env.QB_CLIENT_ID!,
        process.env.QB_CLIENT_SECRET!,
        account.accessToken,
        false, // Não é tokenSecret (usar OAuth2)
        account.realmId,
        true, // Use sandbox? Troque para false em produção!
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
              console.error("DEBUG: Erro na busca de clientes:", err);
              reject(err);
            } else {
              console.log("DEBUG: Clientes encontrados:", data?.QueryResponse?.Customer?.length || 0);
              resolve(data);
            }
          });
        })
      );

      const allClients = result.QueryResponse?.Customer || [];

      let totalSynced = 0;
      for (const qbClient of allClients) {
        const email = qbClient.PrimaryEmailAddr?.Address;
        if (!email) continue;

        // Busca composta por email + company_id
        const localClient = await prisma.client.findFirst({
          where: {
            email: email,
            company_id: companyId,
          },
        });

        const syncData = {
          name: qbClient.DisplayName,
          email: qbClient.PrimaryEmailAddr.Address,
          document: qbClient.TaxIdentifier || null, // Melhor fonte para CPF/CNPJ
          phone: qbClient.PrimaryPhone?.FreeFormNumber || null,
          city_and_state: qbClient.BillAddr
            ? `${qbClient.BillAddr.City || ""}, ${qbClient.BillAddr.CountrySubDivisionCode || ""}`.trim()
            : null,
          birth_date: qbClient.BirthDate || null,
          location: qbClient.BillAddr?.Line1 || null,
          date_update: qbClient.MetaData && qbClient.MetaData.LastUpdatedTime
            ? new Date(qbClient.MetaData.LastUpdatedTime)
            : new Date(),
          idQuickbooks: qbClient.Id,
          sync_version: localClient ? (localClient.sync_version || 0) + 1 : 0,
          avatar: localClient?.avatar || null,
          lat: localClient?.lat || null,
          log: localClient?.log || null,
          radius: localClient?.radius || null,
          autorId: localClient?.autorId || userId,
          // projects: undefined, // Não atualiza projetos aqui
          stripeCustomerId: localClient?.stripeCustomerId || null,
          company_id: companyId,
        };

        if (localClient) {
          if (
            qbClient.MetaData &&
            new Date(qbClient.MetaData.LastUpdatedTime) > localClient.date_update
          ) {
            await prisma.client.update({
              where: { id: localClient.id },
              data: syncData,
            });
            await prisma.syncLog.create({
              data: {
                entity: "customers",
                action: "Updated",
                entityId: localClient.id,
                companyId,
                details: { reason: "QuickBooks mais recente", oldData: localClient, newData: syncData },
              },
            });
            totalSynced++;
          } else {
            await prisma.syncLog.create({
              data: {
                entity: "customers",
                action: "Skipped",
                entityId: localClient.id,
                companyId,
                details: { reason: "Data mais recente localmente" },
              },
            });
          }
        } else {
          const newClient = await prisma.client.create({ data: syncData });
          await prisma.syncLog.create({
            data: {
              entity: "customers",
              action: "Inserted",
              entityId: newClient.id,
              companyId,
              details: syncData,
            },
          });
          totalSynced++;
        }
      }

      res.status(200).json({ message: "Sincronização concluída", synced: totalSynced });
    } catch (error: any) {
      console.error("Erro na sincronização de clientes:", error);
      res.status(500).json({ error: "Erro interno na sincronização", details: error.message });
    }
  }
}
