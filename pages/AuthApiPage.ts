import { APIRequestContext, expect } from '@playwright/test';
import { eInvoiceConfig } from '../config/eInvoice.config';
import { buildBasicAuth, extractAccessToken } from '../utils/helpers';

/**
 * POM for E-Invoice auth APIs:
 * 1) OAuth token (token1)
 * 2) Authenticate (token2 using token1)
 */
export class AuthApiPage {
  constructor(private readonly request: APIRequestContext) {}

  async getOauthToken(): Promise<string> {
    const response = await this.request.post(
      `${eInvoiceConfig.baseUrl}/auth-server/oauth/token`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          gstin: eInvoiceConfig.gstin,
          Authorization: buildBasicAuth(
            eInvoiceConfig.basicAuthHeader,
            eInvoiceConfig.clientId,
            eInvoiceConfig.clientSecret
          ),
        },
        form: {
          grant_type: 'password',
          username: eInvoiceConfig.oauthUsername,
          password: eInvoiceConfig.oauthPassword,
          client_id: eInvoiceConfig.clientId,
          scope: eInvoiceConfig.oauthScope,
        },
      }
    );

    const body = await response.json();
    console.log('1) OAuth-Token status:', response.status());
    expect(response.ok(), `OAuth failed: ${JSON.stringify(body)}`).toBeTruthy();
    expect(body.access_token, 'OAuth access_token missing').toBeTruthy();
    return body.access_token as string;
  }

  async getEInvoiceAuthToken(oauthToken: string): Promise<string> {
    const response = await this.request.post(
      `${eInvoiceConfig.baseUrl}/einvoice/v1.03/authentication`,
      {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          gstin: eInvoiceConfig.gstin,
          action: 'ACCESSTOKEN',
          'X-Connector-Auth-Token': eInvoiceConfig.connectorAuthToken,
          Authorization: `Bearer ${oauthToken}`,
        },
        data: {
          action: 'ACCESSTOKEN',
          username: eInvoiceConfig.authUsername,
          password: eInvoiceConfig.authPassword,
        },
      }
    );

    const body = await response.json();
    console.log('2) Authenticate status:', response.status());
    expect(response.ok(), `Authenticate failed: ${JSON.stringify(body)}`).toBeTruthy();

    const token2 = extractAccessToken(body);
    expect(
      token2,
      `E-Invoice auth token missing in response: ${JSON.stringify(body)}`
    ).toBeTruthy();

    return token2 as string;
  }

  /** Full auth chain: OAuth (token1) -> Authenticate (token2) */
  async getApiToken(): Promise<{ oauthToken: string; apiToken: string }> {
    const oauthToken = await this.getOauthToken();
    const apiToken = await this.getEInvoiceAuthToken(oauthToken);
    return { oauthToken, apiToken };
  }
}
