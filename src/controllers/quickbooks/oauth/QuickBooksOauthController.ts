import { Request, Response } from "express";
import { prisma } from "../../../utils/prisma";
import axios from "axios";
import querystring from "querystring";

import { oauthClient } from "../util/QuickBooksOAuthClient";
import { refreshAccessToken } from "../util/QuickBooksTokenService";

export class QuickBooksController {
  // faz o oauth para o quickbooks
  async authorize(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      console.log("valor do userId", userId)
      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const clientId = process.env.QUICKBOOKS_CLIENT_ID;
      console.log("valor do clientId", clientId)
      // Construir o redirectUri combinando URL_API e a rota de callback
      const redirectUri = `${process.env.URL_API}${process.env.QUICKBOOKS_CALLBACK_PATH}`;
      console.log("valor do redirectUri", redirectUri)

      // Parâmetros para autorização
      const authParams = {
        client_id: clientId,
        response_type: 'code',
        scope: [
          'com.intuit.quickbooks.accounting',
          'com.intuit.quickbooks.payment',
          'openid',
          'profile',
          'email',
          'phone',
          'address'
        ],
        redirect_uri: redirectUri,
        state: userId // Passamos o userId como state para recuperar no callback
      };

      // Construir URL de autorização
      const authorizationUri = oauthClient.authorizeUri(authParams);
      console.log("valor do authorizationUri", authorizationUri)
      console.log("Escopos solicitados:", [
        'com.intuit.quickbooks.accounting',
        'com.intuit.quickbooks.payment',
        'openid',
        'profile',
        'email',
        'phone',
        'address'
      ].join(' '));
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
      const userId = state as string;

      if (error) {
        return res.redirect(
          `${process.env.URL_FRONT}/stripe-config?error=${encodeURIComponent(String(error))}`
        );
      }

      if (!code || !realmId || !userId) {
        // return res.status(400).json({ error: "Missing required parameters" });
        return res.redirect(
          `${process.env.URL_FRONT}/stripe-config?error=missing_params`
        );
      }

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Pegue o company_id do usuário
      const userCompanyId = user.company_id;

      const clientId = process.env.QUICKBOOKS_CLIENT_ID;
      console.log("valor do clientId", clientId)
      const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
      console.log("valor do clientSecret", clientSecret)
      // Construir o redirectUri combinando URL_API e a rota de callback
      const redirectUri = `${process.env.URL_API}${process.env.QUICKBOOKS_CALLBACK_PATH}`;
      console.log("valor do redirectUri", redirectUri)
      // Trocar o código de autorização por tokens
      const tokenResponse = await axios.post(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        querystring.stringify({
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
          }
        }
      );

      const { access_token, refresh_token, expires_in, scope } = tokenResponse.data;
      console.log("##### access_token", access_token)
      console.log("##### refresh_token", refresh_token)
      console.log("##### expires_in", expires_in)
      console.log("##### scope", scope)
      // Calcular data de expiração
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      // Verificar se já existe uma conta para este usuário
      const existingAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      // Definir escopos padrão se vier undefined
      const savedScope = scope || 'com.intuit.quickbooks.accounting com.intuit.quickbooks.payment';

      if (existingAccount) {
        // Atualizar a conta existente
        await prisma.quickBooksAccount.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
            realmId: realmId as string,
            expiresAt,
            scopes: savedScope,
            needsReauthorization: false,
            company_id: userCompanyId,
          }
        });
      } else {
        // Criar uma nova conta
        await prisma.quickBooksAccount.create({
          data: {
            user_id: userId,
            realmId: realmId as string,
            accessToken: access_token,
            refreshToken: refresh_token,
            expiresAt,
            scopes: savedScope,
            needsReauthorization: false,
            company_id: userCompanyId,
          }
        });
      }

      // Redirecionar para a página de configuração do Stripe no frontend
      return res.redirect(`${process.env.URL_FRONT}/stripe-config`);
      // return res.redirect(`${process.env.URL_FRONT}/quickbooks-config?success=true`);
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
      const quickBooksAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      // Se não tem conta, retorna que não está conectado
      if (!quickBooksAccount) {
        return res.status(200).json({
          isConnected: false,
          needsReauthorization: false,
          accountInfo: null
        });
      }

      // Verificar se o token está expirado
      const isTokenExpired = new Date() > quickBooksAccount.expiresAt;

      // Se o token estiver expirado, tenta fazer o refresh automaticamente
      if (isTokenExpired) {
        try {
          // Chamar a função de refresh token
          const refreshResult = await refreshAccessToken(quickBooksAccount.refreshToken, quickBooksAccount.id);
          
          if (refreshResult.success) {
            // Se o refresh foi bem-sucedido, retorna os dados atualizados
            return res.status(200).json({
              isConnected: true,
              needsReauthorization: false,
              accountInfo: {
                realmId: quickBooksAccount.realmId,
                expiresAt: refreshResult.expiresAt
              },
              tokenRefreshed: true
            });
          } else {
            // Se o refresh falhou, indica que precisa de reautorização
            return res.status(200).json({
              isConnected: true,
              needsReauthorization: true,
              accountInfo: {
                realmId: quickBooksAccount.realmId,
                expiresAt: quickBooksAccount.expiresAt
              },
              refreshError: refreshResult.error
            });
          }
        } catch (refreshError: any) {
          // Se ocorreu um erro no refresh, indica que precisa de reautorização
          return res.status(200).json({
            isConnected: true,
            needsReauthorization: true,
            accountInfo: {
              realmId: quickBooksAccount.realmId,
              expiresAt: quickBooksAccount.expiresAt
            },
            refreshError: refreshError.message
          });
        }
      }

      //tenho que tratar isso no frontend
      if (quickBooksAccount.needsReauthorization) {
        return res.status(200).json({
          isConnected: true,
          needsReauthorization: true,
          reason: "insufficient_permissions",
          authUrl: `${process.env.URL_API}/quickbooks/authorize/${userId}`
        });
      }

      // Se o token não está expirado, retorna os dados normalmente
      return res.status(200).json({
        isConnected: true,
        needsReauthorization: false,
        accountInfo: {
          realmId: quickBooksAccount.realmId,
          expiresAt: quickBooksAccount.expiresAt
        }
      });
    } catch (error: any) {
      console.error("Erro ao verificar status do QuickBooks:", error);
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
} 