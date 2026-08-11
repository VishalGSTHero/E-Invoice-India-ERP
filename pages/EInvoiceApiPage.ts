import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { eInvoiceConfig } from '../config/eInvoice.config';
import { todayDocDate, uniqueDocNo } from '../utils/helpers';
import { buildGenerateIrnPayload } from '../utils/payload.builder';
import { preparePayload, Scenario } from '../utils/scenario.loader';

export type GenerateIrnResult = {
  response: APIResponse;
  body: Record<string, any>;
  docNo: string;
  docDate: string;
  scenarioName?: string;
};

/**
 * POM for E-Invoice submit / invoice APIs
 */
export class EInvoiceApiPage {
  constructor(private readonly request: APIRequestContext) {}

  private async postInvoice(apiToken: string, payload: Record<string, any>): Promise<APIResponse> {
    return this.request.post(`${eInvoiceConfig.baseUrl}/einvoice/v1.03/invoice`, {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        gstin: eInvoiceConfig.gstin,
        action: 'GENERATEIRN',
        'X-Connector-Auth-Token': eInvoiceConfig.connectorAuthToken,
        Authorization: `Bearer ${apiToken}`,
      },
      data: payload,
    });
  }

  async generateIrn(apiToken: string, docNoPrefix = 'ERP'): Promise<GenerateIrnResult> {
    const docNo = uniqueDocNo(docNoPrefix);
    const docDate = todayDocDate();
    const payload = buildGenerateIrnPayload(docNo, docDate);

    const response = await this.postInvoice(apiToken, payload);
    const body = await response.json();
    console.log('Generate EInvoice status:', response.status());
    console.log('Doc No:', docNo, 'Doc Date:', docDate);
    console.log('Generate response:', JSON.stringify(body, null, 2));

    expect(response.ok(), `Generate IRN failed: ${JSON.stringify(body)}`).toBeTruthy();
    return { response, body, docNo, docDate };
  }

  /** Submit using a Postman scenario payload (unique doc no/date applied) */
  async generateIrnForScenario(
    apiToken: string,
    scenario: Scenario
  ): Promise<GenerateIrnResult> {
    const { payload, docNo, docDate } = preparePayload(scenario);
    console.log(`\n=== Scenario: ${scenario.name} ===`);
    console.log('Doc No:', docNo, 'Doc Date:', docDate);
    console.log('Doc Typ:', payload.data?.docDtls?.typ, 'Sup Typ:', payload.data?.tranDtls?.supTyp);
    console.log('Items:', payload.data?.itemList?.length || 0);
    console.log(
      'Flags:',
      JSON.stringify({
        dispDtls: !!payload.data?.dispDtls,
        shipDtls: !!payload.data?.shipDtls,
        ewbDtls: !!(payload.data?.ewbDtls || payload.data?.EwbDtls),
      })
    );

    const response = await this.postInvoice(apiToken, payload);
    const body = await response.json();
    console.log('HTTP status:', response.status());
    console.log('API status:', body.status);
    if (body.error) console.log('Errors:', JSON.stringify(body.error, null, 2));
    if (body.data?.Irn) console.log('IRN:', body.data.Irn);

    return { response, body, docNo, docDate, scenarioName: scenario.name };
  }
}
