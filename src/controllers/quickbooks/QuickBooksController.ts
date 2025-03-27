import { Request, Response } from "express";
import { prisma } from "../../utils/prisma";
import axios from "axios";
import querystring from "querystring";

export class QuickBooksController {
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
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: redirectUri,
        state: userId // Passamos o userId como state para recuperar no callback
      };

      // Construir URL de autorização
      const authUrl = `https://appcenter.intuit.com/connect/oauth2/authorize?${querystring.stringify(authParams)}`;
      console.log("valor do authUrl", authUrl)
      return res.status(200).json({ url: authUrl });
    } catch (error) {
      console.error("Erro ao iniciar autorização QuickBooks:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

  async callback(req: Request, res: Response) {
    console.log("inicio de callback")
    try {
      const { code, state, realmId } = req.query;
      const userId = state as string;

      if (!code || !realmId || !userId) {
        return res.status(400).json({ error: "Missing required parameters" });
      }

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

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

      const { access_token, refresh_token, expires_in } = tokenResponse.data;
      
      // Calcular data de expiração
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + expires_in);

      // Verificar se já existe uma conta para este usuário
      const existingAccount = await prisma.quickBooksAccount.findFirst({
        where: { user_id: userId }
      });

      if (existingAccount) {
        // Atualizar conta existente
        await prisma.quickBooksAccount.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
            realmId: realmId as string,
            expiresAt
          }
        });
      } else {
        // Criar nova conta
        await prisma.quickBooksAccount.create({
          data: {
            accessToken: access_token,
            refreshToken: refresh_token,
            realmId: realmId as string,
            expiresAt,
            user: {
              connect: { id: userId }
            }
          }
        });
      }

      // Redirecionar para a página de configuração do Stripe no frontend
      return res.redirect(`${process.env.URL_FRONT}/stripe-config`);
    // res.send("OK") 
    } catch (error) {
      console.error("Erro no callback do QuickBooks:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }

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

      // Verificar se a conta existe e se os tokens são válidos
      const isConnected = !!quickBooksAccount;
      
      // Verificar se o token está expirado
      const isTokenExpired = quickBooksAccount 
        ? new Date() > quickBooksAccount.expiresAt 
        : true;

      return res.status(200).json({
        isConnected,
        needsReauthorization: isConnected && isTokenExpired,
        accountInfo: isConnected ? {
          realmId: quickBooksAccount.realmId,
          expiresAt: quickBooksAccount.expiresAt
        } : null
      });
    } catch (error) {
      console.error("Erro ao verificar status do QuickBooks:", error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  }
} 