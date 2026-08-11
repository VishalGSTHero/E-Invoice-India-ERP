import { test, expect } from '@playwright/test';
import { AuthApiPage } from '../pages/AuthApiPage';
import { EInvoiceApiPage } from '../pages/EInvoiceApiPage';
import { extractIrn, isGenerateSuccess } from '../utils/helpers';
import { loadScenarios } from '../utils/scenario.loader';

/**
 * Runs ALL Generate IRN submit scenarios from Postman collection
 * (each payload is different: regular, dispatch, ship-to, eway, export, CRN, DBN, multiline...)
 */
const scenarios = loadScenarios();

test.describe('E-Invoice India - All Submit APIs', () => {
  // Shared API token fetched once per worker
  let apiToken = '';

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    const authApi = new AuthApiPage(request);
    const tokens = await authApi.getApiToken();
    apiToken = tokens.apiToken;
    expect(apiToken).toBeTruthy();
    await request.dispose();
  });

  for (const scenario of scenarios) {
    test(`Submit: ${scenario.name}`, async ({ request }) => {
      expect(apiToken, 'API token missing from beforeAll').toBeTruthy();

      const eInvoiceApi = new EInvoiceApiPage(request);
      const { body, docNo, response } = await eInvoiceApi.generateIrnForScenario(
        apiToken,
        scenario
      );

      expect(response.status(), `HTTP failed for ${scenario.name}`).toBe(200);
      expect(docNo).toMatch(/^[a-zA-Z1-9][a-zA-Z0-9/-]{0,15}$/);

      const ok = isGenerateSuccess(body);
      const irn = extractIrn(body);
      console.log(`Result [${scenario.name}] success=${ok} irn=${irn || 'N/A'}`);

      expect(
        ok,
        `Generate IRN failed for "${scenario.name}": ${JSON.stringify(body.error || body)}`
      ).toBeTruthy();
    });
  }
});
