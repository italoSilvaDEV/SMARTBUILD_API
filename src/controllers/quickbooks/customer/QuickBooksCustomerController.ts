import { Request, Response } from "express";
import QuickBooks from "node-quickbooks"; // SDK QuickBooks
import Bottleneck from "bottleneck"; // Para gerenciar rate limits
import { prisma } from "../../../utils/prisma";
import { refreshAccessToken } from "../util/QuickBooksTokenService";


const limiter = new Bottleneck({
  maxConcurrent: 1,
  minTime: 1000, // 1 requisição por segundo para respeitar rate limits
});

export class QuickBooksClientController {
//   async syncClients(req: Request, res: Response) {
//     const { companyId, userId } = req.params;

//     if (!userId) {
//       return res.status(400).json({ error: "User ID não fornecido" });
//     }

//     if (!companyId) {
//       return res.status(400).json({ error: "Company ID não fornecido" });
//     }

//     try {
//       // Buscar as credenciais do QuickBooksAccount para o userId
//       const quickBooksAccount = await prisma.quickBooksAccount.findUnique({
//         where: { user_id: userId },
//       });

//       if (!quickBooksAccount) {
//         return res.status(404).json({ error: "Conta QuickBooks não encontrada para o usuário" });
//       }

//       // Verificar se o accessToken expirou
//       const now = new Date();
//       if (quickBooksAccount.expiresAt && now > quickBooksAccount.expiresAt) {
//         const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, userId);
//         if (!refreshResult.success) {
//           return res.status(401).json({ error: "Falha ao renovar o token de acesso: " + refreshResult.error });
//         }
//       }

//       // Recarregar as credenciais atualizadas após o refresh, se ocorreu
//       const updatedAccount = await prisma.quickBooksAccount.findUnique({
//         where: { user_id: userId },
//       });

//       if (!updatedAccount) {
//         return res.status(404).json({ error: "Conta QuickBooks não encontrada após refresh" });
//       }

//       // Instanciar o QuickBooks com as credenciais dinâmicas
//       const qb = new QuickBooks(
//         {
//           consumerKey: process.env.QB_CONSUMER_KEY, // Substituir por credencial global se aplicável
//           consumerSecret: process.env.QB_CONSUMER_SECRET, // Substituir por credencial global se aplicável
//           token: updatedAccount.accessToken,
//           tokenSecret: updatedAccount.refreshToken, // Ajuste: tokenSecret pode não ser o mesmo que refreshToken; veja nota abaixo
//         },
//         updatedAccount.realmId,
//         true // useSandbox, ajuste para false em produção
//       );

//       let startPosition = 1;
//       const maxResults = 100;
//       let allClients: any[] = [];
//       let totalSynced = 0;

//       // Loop paginado para buscar todos os clientes
//       while (true) {
//         const clients = await limiter.schedule(() =>
//           qb.customerQuery({
//             where: [`CompanyId = '${companyId}'`],
//             startPosition,
//             maxResults,
//           })
//         );
//         const customerList = clients.QueryResponse.Customer || [];
//         allClients = allClients.concat(customerList);

//         if (customerList.length < maxResults) break;
//         startPosition += maxResults;
//       }

//       // Processar cada cliente do QuickBooks
//       for (const qbClient of allClients) {
//         const email = qbClient.PrimaryEmailAddr?.Address;
//         if (!email) continue; // Ignora clientes sem e-mail

//         const localClient = await prisma.client.findUnique({
//           where: { email },
//         });

//         const syncData = {
//           name: qbClient.DisplayName,
//           email: qbClient.PrimaryEmailAddr.Address,
//           document: qbClient.Other?.[0]?.FreeFormNumber || null,
//           phone: qbClient.PrimaryPhone?.FreeFormNumber || null,
//           city_and_state: `${qbClient.BillAddr?.City || ""}, ${qbClient.BillAddr?.CountrySubDivisionCode || ""}`.trim() || null,
//           birth_date: qbClient.BirthDate || null,
//           location: qbClient.BillAddr?.Line1 || null,
//           date_update: new Date(qbClient.MetaData.LastUpdatedTime),
//           idQuickbooks: qbClient.Id, // Armazena o ID do QuickBooks
//           sync_version: localClient ? localClient.sync_version + 1 : 0, // Incrementa a versão
//           // Campos preservados do local (não sobrescritos)
//           avatar: localClient?.avatar || null,
//           lat: localClient?.lat || null,
//           log: localClient?.log || null,
//           radius: localClient?.radius || null,
//           autorId: localClient?.autorId || userId || null,
//           projects: localClient?.projects || [],
//           stripeCustomerId: localClient?.stripeCustomerId || null, // Preservado, não sobrescrito
//           company_id: companyId,
//         };

//         if (localClient) {
//           // Estratégia conservadora: só atualiza se QuickBooks for mais recente
//           if (new Date(qbClient.MetaData.LastUpdatedTime) > localClient.date_update) {
//             await prisma.client.update({
//               where: { id: localClient.id },
//               data: syncData,
//             });
//             await prisma.syncLog.create({
//               data: {
//                 entity: "Client",
//                 action: "Updated",
//                 entityId: localClient.id,
//                 companyId,
//                 details: { reason: "QuickBooks mais recente", oldData: localClient, newData: syncData },
//               },
//             });
//             totalSynced++;
//           } else {
//             await prisma.syncLog.create({
//               data: {
//                 entity: "Client",
//                 action: "Skipped",
//                 entityId: localClient.id,
//                 companyId,
//                 details: { reason: "Data mais recente localmente" },
//               },
//             });
//           }
//         } else {
//           // Novo cliente
//           const newClient = await prisma.client.create({ data: syncData });
//           await prisma.syncLog.create({
//             data: {
//               entity: "Client",
//               action: "Inserted",
//               entityId: newClient.id,
//               companyId,
//               details: syncData,
//             },
//           });
//           totalSynced++;
//         }
//       }

//       res.status(200).json({ message: "Sincronização concluída", synced: totalSynced });
//     } catch (error) {
//       console.error("Erro na sincronização de clientes:", error);
//       res.status(500).json({ error: "Erro interno na sincronização" });
//     }
//   }
}