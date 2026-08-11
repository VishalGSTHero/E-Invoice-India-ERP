import { test, expect } from '@playwright/test';
import { AuthApiPage } from '../pages/AuthApiPage';
import { EInvoiceApiPage } from '../pages/EInvoiceApiPage';
import { extractIrn, isGenerateSuccess } from '../utils/helpers';

/**
 * E-Invoice India (ERP template) — POM based
 * Flow:
 *   1) OAuth token  -> token1
 *   2) Authenticate -> token2 (using token1)
 *   3) Generate IRN (submit) using token2
 */
test.describe.configure({ mode: 'serial' });

test.describe('E-Invoice India - ERP template', () => {
  let authApi: AuthApiPage;
  let eInvoiceApi: EInvoiceApiPage;
  let oauthToken = '';
  let apiToken = '';

  test.beforeEach(async ({ request }) => {
    authApi = new AuthApiPage(request);
    eInvoiceApi = new EInvoiceApiPage(request);
  });

  test('1. Generate OAuth token (token1)', async () => {
    oauthToken = await authApi.getOauthToken();
    console.log('token1 (OAuth) received');
    expect(oauthToken.length).toBeGreaterThan(10);
  });

  test('2. Authenticate and get API token (token2)', async () => {
    expect(oauthToken, 'Run OAuth step first').toBeTruthy();
    apiToken = await authApi.getEInvoiceAuthToken(oauthToken);
    console.log('token2 (API) received');
    expect(apiToken.length).toBeGreaterThan(10);
  });

  test('3. Submit Generate EInvoice using token2', async () => {
    expect(apiToken, 'Run Authenticate step first').toBeTruthy();
    const { body } = await eInvoiceApi.generateIrn(apiToken);

    const irn = extractIrn(body);
    console.log('IRN:', irn);
    expect(isGenerateSuccess(body)).toBeTruthy();
  });

  test('End-to-end: OAuth -> Authenticate -> Generate IRN', async () => {
    const { oauthToken: token1, apiToken: token2 } = await authApi.getApiToken();
    const { body, docNo } = await eInvoiceApi.generateIrn(token2);

    expect(token1).toBeTruthy();
    expect(token2).toBeTruthy();
    expect(docNo).toMatch(/^ERP/);
    expect(isGenerateSuccess(body)).toBeTruthy();
  });
});
