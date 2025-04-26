import { prisma } from "../../utils/prisma";
import axios from "axios";
import querystring from "querystring";

export async function refreshAccessToken(refreshToken: string, userId: string) {
  try {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;

    // Trocar o refresh token por um novo access token
    const tokenResponse = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
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

    // Atualizar tokens no banco de dados
    await prisma.quickBooksAccount.updateMany({
      where: { user_id: userId },
      data: {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt
      }
    });

    return {
      success: true,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt
    };
  } catch (error: any) {
    console.error("Error refreshing QuickBooks token:", error);
    return {
      success: false,
      error: error.message
    };
  }
} 