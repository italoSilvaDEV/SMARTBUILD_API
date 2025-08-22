// @ts-ignore
import OAuthClient from 'intuit-oauth';

// Criar e configurar o cliente OAuth
export const oauthClient = new OAuthClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
  environment: process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
  redirectUri: `${process.env.URL_API}${process.env.QUICKBOOKS_CALLBACK_PATH}`
});

