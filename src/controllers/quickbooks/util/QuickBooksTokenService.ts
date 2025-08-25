// quickbooks/util/QuickBooksTokenService.ts
import axios from "axios";
import querystring from "querystring";
import { prisma } from "../../../utils/prisma";

export async function refreshAccessToken(refreshToken: string, accountId: string) {
  try {
    const clientId = process.env.QUICKBOOKS_CLIENT_ID!;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET!;

    const tokenResponse = await axios.post(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      querystring.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
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
      x_refresh_token_expires_in,
    } = tokenResponse.data;

    const expiresAt = new Date(Date.now() + Number(expires_in) * 1000);
    const refreshExpiresAt = x_refresh_token_expires_in
      ? new Date(Date.now() + Number(x_refresh_token_expires_in) * 1000)
      : undefined;

    await prisma.quickBooksAccount.update({
      where: { id: accountId },
      data: {
        accessToken: access_token,
        // refresh_token pode rotacionar; atualize apenas se vier
        ...(refresh_token ? { refreshToken: refresh_token } : {}),
        expiresAt,
        ...(refreshExpiresAt ? { refreshExpiresAt } : {}),
        updatedAt: new Date(),
      },
    });

    return {
      success: true as const,
      accessToken: access_token,
      refreshToken: refresh_token ?? refreshToken,
      expiresAt,
      refreshExpiresAt,
    };
  } catch (error: any) {
    const status = error?.response?.status;
    const errCode = error?.response?.data?.error;
    const errDesc = error?.response?.data?.error_description;

    // Se o refresh token estiver inválido/expirado
    if (status === 400 && errCode === "invalid_grant") {
      try {
        await prisma.quickBooksAccount.update({
          where: { id: accountId },
          data: { needsReauthorization: true },
        });
      } catch {}
    }

    console.error("Error refreshing QuickBooks token:", errDesc || error?.message);

    return {
      success: false as const,
      error: errDesc || error?.message || "refresh_failed",
    };
  }
}
