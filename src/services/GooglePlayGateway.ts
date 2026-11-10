import { GoogleBillingError } from './GooglePlayPurchase';
export interface GooglePlayGateway {
    get(token: string): Promise<any>;
    acknowledge(token: string, productId: string): Promise<void>;
    verifyPush(token: string, audience: string): Promise<{
        email?: string;
        email_verified?: boolean;
        iss?: string;
    }>;
}
export function createGooglePlayGateway(): GooglePlayGateway {
    // Lazy SDK/credential loading: importing the service cannot contact Google.
    const publisher = () => {
        const { google } = require('googleapis');
        const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
        if (!raw || !process.env.GOOGLE_PLAY_PACKAGE_NAME)
            throw new GoogleBillingError('GOOGLE_CONFIG_MISSING', 503);
        const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(raw), scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
        return google.androidpublisher({ version: 'v3', auth });
    };
    return {
        async get(token) { return (await publisher().purchases.subscriptionsv2.get({ packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME, token }, { timeout: 15000 })).data; },
        async acknowledge(token, subscriptionId) { await publisher().purchases.subscriptions.acknowledge({ packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME, subscriptionId, token, requestBody: {} }, { timeout: 15000 }); },
        async verifyPush(idToken, audience) { const { google } = require('googleapis'); return (await new google.auth.OAuth2().verifyIdToken({ idToken, audience })).getPayload(); },
    };
}
