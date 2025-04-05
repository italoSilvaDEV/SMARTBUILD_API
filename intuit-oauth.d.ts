declare module 'intuit-oauth' {
  export default class OAuthClient {
    constructor(options: {
      clientId: string;
      clientSecret: string;
      environment: string;
      redirectUri: string;
    });

    authorizeUri(params: any): string;
    createToken(uri: string): Promise<any>;
    refreshUsingToken(refreshToken: string): Promise<any>;
    revoke(params: any): Promise<any>;
    validateToken(token: any): boolean;
    getToken(): any;
  }
} 