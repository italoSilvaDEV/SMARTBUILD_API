import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import axios from "axios";
import querystring from "querystring";

import { oauthClient } from "../util/QuickBooksOAuthClient";
import { refreshAccessToken } from "../util/QuickBooksTokenService";
import { issueState, verifyAndConsumeState } from "../util/QuickBooksState";
import { qboClientForAccount } from "../util/http/qboClientFactory";

export class QuickBooksController {
  // faz o oauth para o quickbooks
  async authorize(req: Request, res: Response) {
    try {
      const { userId, companyId } = req.params;
      console.log("valor do userId", userId)
      console.log("valor do companyId", companyId)
      if (!userId || !companyId) {
        return res.status(400).json({ error: "Missing userId/companyId" });
      }
      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const clientId = process.env.QUICKBOOKS_CLIENT_ID;

      // Construir o redirectUri combinando URL_API e a rota de callback
      const redirectUri = `${process.env.URL_API}${process.env.QUICKBOOKS_CALLBACK_PATH}`;
      console.log("valor do redirectUri", redirectUri)

      // emite nonce seguro e salva contexto
      const nonce = await issueState(userId, companyId);

      // Parâmetros para autorização
      const authParams = {
        client_id: clientId,
        response_type: 'code',
        scope: [
          'com.intuit.quickbooks.accounting', // FORÇAR accounting como obrigatório
        ],
        redirect_uri: redirectUri,
        state: nonce
      };

      // Construir URL de autorização
      const authorizationUri = oauthClient.authorizeUri(authParams);
      console.log("valor do authorizationUri", authorizationUri)

      return res.status(200).json({ url: authorizationUri });
    } catch (error) {
      console.error("Erro ao iniciar autorização QuickBooks:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
  //ainda nao utlizada pelo frontend
  async callback(req: Request, res: Response) {
    console.log("inicio de callback")
    try {
      const { error, code, state, realmId } = req.query;

      if (error) {
        return res.redirect(`${process.env.URL_FRONT}/stripe-config?error=${encodeURIComponent(String(error))}`);
      }
      if (typeof state !== "string" || !state) {
        return res.redirect(`${process.env.URL_FRONT}/stripe-config?error=invalid_state`);
      }
      if (!code || !realmId) {
        return res.redirect(`${process.env.URL_FRONT}/stripe-config?error=missing_params`);
      }

      // valida e consome state
      const v = await verifyAndConsumeState(state);
      if (!v.ok) {
        return res.redirect(`${process.env.URL_FRONT}/stripe-config?error=invalid_state_${v.reason}`);
      }
      const { userId, companyId } = v;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) { return res.status(404).json({ error: "User not found" }) }

      const clientId = process.env.QUICKBOOKS_CLIENT_ID!;
      const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;
      const redirectUri = `${process.env.URL_API}${process.env.QUICKBOOKS_CALLBACK_PATH}`;

      // Troca code->tokens
      const tokenResp = await axios.post(
        "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
        querystring.stringify({
          grant_type: "authorization_code",
          code: String(code),
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          },
        }
      );

      const {
        access_token,
        refresh_token,
        expires_in,
        scope,
        x_refresh_token_expires_in, // pode vir
      } = tokenResp.data;

    
      // calcula expiração do access token
      const expiresAt = new Date(Date.now() + Number(expires_in) * 1000);
      const refreshExpiresAt = x_refresh_token_expires_in
        ? new Date(Date.now() + Number(x_refresh_token_expires_in) * 1000)
        : undefined;

      // upsert por (userId, companyId)
      let account = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId, company_id: companyId },
      });

      if (account) {
        account = await prisma.quickBooksAccount.update({
          where: { id: account.id },
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
            realmId: String(realmId),
            expiresAt,
            scopes: scope ?? "com.intuit.quickbooks.accounting",
            needsReauthorization: false,
            ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
            updatedAt: new Date(),
          },
        });
      } else {
        account = await prisma.quickBooksAccount.create({
          data: {
            user_id: userId,
            company_id: companyId,
            realmId: String(realmId),
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
            scopes: scope ?? "com.intuit.quickbooks.accounting",
            needsReauthorization: false,
            ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
          },
        });
      }

      // Valida que é QBO Accounting chamando CompanyInfo via REST (com minorversion=75)
      try {
        const api = qboClientForAccount(account.id);
        const { data } = await api.get(`/companyinfo/${account.realmId}`);
        const companyName =
          data?.QueryResponse?.CompanyInfo?.[0]?.CompanyName ??
          data?.QueryResponse?.CompanyInfo?.CompanyName;

        if (companyName) {
          await prisma.quickBooksAccount.update({
            where: { id: account.id },
            data: { companyName },
          });
        }
      } catch (e: any) {
        const status = e?.response?.status;
        const url = `${e?.config?.baseURL ?? ''}${e?.config?.url ?? ''}`;
        const payload = e?.response?.data;
        console.error('CompanyInfo validation failed', { status, url, payload });

        await prisma.quickBooksAccount.update({
          where: { id: account.id },
          data: { needsReauthorization: true },
        });

        return res.redirect(
          `${process.env.URL_FRONT}/stripe-config?error=invalid_realm&msg=${encodeURIComponent(
            "Selecione uma empresa do QuickBooks Online (Accounting)."
          )}`
        );
      }

      return res.redirect(`${process.env.URL_FRONT}/stripe-config?success=true`);

    } catch (error: any) {
      console.error("Erro no callback do QuickBooks:", error);
      return res.redirect(`${process.env.URL_FRONT}/stripe-config?error=${encodeURIComponent(error.message)}`);
    }
  }
  //utlizada pelo frontend para checar se o usuario esta conectado ao quickbooks
  async checkStatus(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verificar se o usuário tem uma conta do QuickBooks
      const account = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      // Se não tem conta, retorna que não está conectado
      if (!account) {
        return res.status(200).json({
          isConnected: false,
          needsReauthorization: false,
          accountInfo: null
        });
      }

      // Se já marcado para reautorizar
      if (account.needsReauthorization) {
        return res.status(200).json({
          isConnected: true,
          needsReauthorization: true,
          reason: "needs_reauthorization",
          message: "Reconecte selecionando uma empresa do QuickBooks Online (Accounting).",
          authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}/${account.company_id}`
        });
      }

      // === Refresh antecipado e também se já expirou ===
      const SKEW_MS = 5 * 60 * 1000; // 5 min
      const now = Date.now();
      const accessExp = new Date(account.expiresAt).getTime();
      const shouldRefresh = accessExp - now <= SKEW_MS; // cobre "quase expirado" e "já expirou" (valor negativo)

      let currentAccount = account;

      if (shouldRefresh) {
        const rr = await refreshAccessToken(account.refreshToken, account.id);
        if (!rr.success) {
          await prisma.quickBooksAccount.update({
            where: { id: account.id },
            data: { needsReauthorization: true }
          });
          return res.status(200).json({
            isConnected: true,
            needsReauthorization: true,
            reason: "token_refresh_failed",
            message: "Não foi possível renovar o acesso. Por favor, reconecte sua conta do QuickBooks.",
            authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}/${account.company_id}`
          });
        }
        // recarrega a conta atualizada do DB
        const refreshed = await prisma.quickBooksAccount.findUnique({ where: { id: account.id } });
        if (refreshed) currentAccount = refreshed;
      }

      // === Validação leve de Accounting via REST (wrapper auto-refresh em 401) ===
      try {
        const api = qboClientForAccount(currentAccount.id);
        await api.get(`/companyinfo/${currentAccount.realmId}`);

        return res.status(200).json({
          isConnected: true,
          needsReauthorization: false,
          accountInfo: {
            realmId: currentAccount.realmId,
            expiresAt: currentAccount.expiresAt,
            companyName: currentAccount.companyName ?? undefined
          }
        });
      } catch (validationErr: any) {
        const status = validationErr?.response?.status;

        // 401: última tentativa explícita de refresh + revalidação
        if (status === 401) {
          const rr = await refreshAccessToken(currentAccount.refreshToken, currentAccount.id);
          if (rr.success) {
            try {
              const api = qboClientForAccount(currentAccount.id);
              await api.get(`/companyinfo/${currentAccount.realmId}`);
              const latest = await prisma.quickBooksAccount.findUnique({ where: { id: currentAccount.id } }) ?? currentAccount;

              return res.status(200).json({
                isConnected: true,
                needsReauthorization: false,
                accountInfo: {
                  realmId: latest.realmId,
                  expiresAt: latest.expiresAt,
                  companyName: latest.companyName ?? undefined
                }
              });
            } catch { /* cai para marcar reauth abaixo */ }
          }

          await prisma.quickBooksAccount.update({
            where: { id: currentAccount.id },
            data: { needsReauthorization: true }
          });
          return res.status(200).json({
            isConnected: true,
            needsReauthorization: true,
            reason: "token_invalid",
            message: "Seu acesso ao QuickBooks expirou. Por favor, reconecte.",
            authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}/${currentAccount.company_id}`
          });
        }

        // 403: geralmente Payments-only ou permissão insuficiente
        if (status === 403) {
          await prisma.quickBooksAccount.update({
            where: { id: currentAccount.id },
            data: { needsReauthorization: true }
          });
          return res.status(200).json({
            isConnected: true,
            needsReauthorization: true,
            reason: "invalid_accounting_access",
            message: "Por favor, reconecte selecionando uma empresa do QuickBooks Online (Accounting), não a conta de pagamentos.",
            authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}/${currentAccount.company_id}`
          });
        }

        // Outras falhas (rede/Intuit down) => não derruba a UI
        return res.status(200).json({
          isConnected: true,
          needsReauthorization: false,
          accountInfo: {
            realmId: currentAccount.realmId,
            expiresAt: currentAccount.expiresAt,
            companyName: currentAccount.companyName ?? undefined
          }
        });
      }
    } catch (error: any) {
      console.error("Erro ao verificar status do QuickBooks:", error?.message);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message
      });
    }
  }

  //refresh token ainda nao utlizada pelo frontend
  async refreshToken(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      // Buscar a conta QuickBooks do usuário
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      if (!quickBooksAccount) {
        return res.status(404).json({ error: "QuickBooks account not found" });
      }

      // Chamar a função de refresh token
      const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, quickBooksAccount.id);

      if (!refreshResult.success) {
        return res.status(401).json({
          error: "Failed to refresh token",
          details: refreshResult.error
        });
      }

      return res.status(200).json({
        message: "Token refreshed successfully",
        expiresAt: refreshResult.expiresAt
      });
    } catch (error: any) {
      console.error("Error refreshing QuickBooks token:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message
      });
    }
  }

  //  NOVO: Desconectar QuickBooks
  async disconnect(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { revokeOnQuickBooks = false } = req.body; // Opção para revogar no QuickBooks também

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Buscar a conta QuickBooks do usuário
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      if (!quickBooksAccount) {
        return res.status(404).json({
          error: "QuickBooks account not found",
          message: "Usuário não possui conta QuickBooks conectada"
        });
      }

      // Se solicitado, revogar o token no QuickBooks
      if (revokeOnQuickBooks) {
        try {
          console.log(" Revogando token no QuickBooks...");

          // Revogar refresh token no QuickBooks (isso invalida todos os tokens)
          const revokeResponse = await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${Buffer.from(`${process.env.QUICKBOOKS_CLIENT_ID}:${process.env.QUICKBOOKS_CLIENT_SECRET}`).toString('base64')}`
            },
            body: new URLSearchParams({
              'token': quickBooksAccount.refreshToken
            })
          });

          if (revokeResponse.ok) {
            console.log(" Token revogado com sucesso no QuickBooks");
          } else {
            console.warn(" Falha ao revogar token no QuickBooks, continuando com desconexão local");
          }
        } catch (revokeError: any) {
          console.error(" Erro ao revogar token no QuickBooks:", revokeError);
          // Continua mesmo se a revogação falhar
        }
      }

      // Remover a conta QuickBooks da nossa base de dados
      await prisma.quickBooksAccount.delete({
        where: { id: quickBooksAccount.id }
      });

      console.log(` Conta QuickBooks desconectada para usuário ${userId}`);

      return res.status(200).json({
        message: "QuickBooks desconectado com sucesso",
        disconnectedAt: new Date(),
        revokedOnQuickBooks: revokeOnQuickBooks,
        accountInfo: {
          realmId: quickBooksAccount.realmId,
          connectedSince: quickBooksAccount.createdAt
        }
      });

    } catch (error: any) {
      console.error(" Erro ao desconectar QuickBooks:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message
      });
    }
  }

  //  NOVO: Forçar reautorização (marca como needsReauthorization)
  async forceReauthorization(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Buscar a conta QuickBooks do usuário
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      if (!quickBooksAccount) {
        return res.status(404).json({
          error: "QuickBooks account not found"
        });
      }

      // Marcar como precisando reautorização
      await prisma.quickBooksAccount.update({
        where: { id: quickBooksAccount.id },
        data: {
          needsReauthorization: true,
          updatedAt: new Date()
        }
      });

      return res.status(200).json({
        message: "Reautorização forçada com sucesso",
        needsReauthorization: true,
        authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}/${quickBooksAccount.company_id}`
      });

    } catch (error: any) {
      console.error(" Erro ao forçar reautorização:", error);
      return res.status(500).json({
        error: "Internal Server Error",
        details: error.message
      });
    }
  }
} 