// @ts-ignore
import OAuthClient from 'intuit-oauth';

// Criar e configurar o cliente OAuth
export const oauthClient = new OAuthClient({
  clientId: process.env.QUICKBOOKS_CLIENT_ID || '',
  clientSecret: process.env.QUICKBOOKS_CLIENT_SECRET || '',
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox',
  redirectUri: `${process.env.URL_API}${process.env.QUICKBOOKS_CALLBACK_PATH}`
});

// Adicione este log
console.log("Ambiente QuickBooks:", process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'); 
console.log("URL API:", process.env.URL_API); 
console.log("QUICKBOOKS_CALLBACK_PATH:", process.env.QUICKBOOKS_CALLBACK_PATH); 
console.log("QUICKBOOKS_CLIENT_ID:", process.env.QUICKBOOKS_CLIENT_ID); 
console.log("QUICKBOOKS_CLIENT_SECRET:", process.env.QUICKBOOKS_CLIENT_SECRET); 