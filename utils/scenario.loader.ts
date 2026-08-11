import fs from 'fs';
import path from 'path';
import { todayDocDate, uniqueDocNo } from './helpers';

export type Scenario = {
  name: string;
  file: string;
  key: string;
};

export function loadScenarios(): Scenario[] {
  const scenariosPath = path.resolve(__dirname, '../testdata/scenarios.json');
  return JSON.parse(fs.readFileSync(scenariosPath, 'utf8')) as Scenario[];
}

export function loadScenarioPayload(scenario: Scenario): Record<string, any> {
  const payloadPath = path.resolve(__dirname, '../testdata/payloads', scenario.file);
  return JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
}

/** Clone Postman payload and force unique doc no + today's date */
export function preparePayload(
  scenario: Scenario,
  options?: { docNoPrefix?: string }
): { payload: Record<string, any>; docNo: string; docDate: string } {
  const payload = structuredClone(loadScenarioPayload(scenario));
  const prefix = (options?.docNoPrefix || scenario.key.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'ERP');
  const docNo = uniqueDocNo(prefix).slice(0, 16); // NIC doc no max 16
  const docDate = todayDocDate();

  if (!payload.data) payload.data = {};
  if (!payload.data.docDtls) payload.data.docDtls = {};
  payload.data.docDtls.no = docNo;
  payload.data.docDtls.dt = docDate;

  // Ensure HSN codes are valid 6-digit codes used by sandbox
  if (Array.isArray(payload.data.itemList)) {
    for (const item of payload.data.itemList) {
      if (item.hsnCd != null) {
        let hsn = String(item.hsnCd);
        while (hsn.length < 6) hsn += '0';
        // Sandbox rejects some padded codes like 721400
        if (hsn === '721400' || hsn === '7214') hsn = '721410';
        item.hsnCd = hsn;
      }

      // barCde / barcode: min 3, max 30 (empty fails on multiline payloads)
      const barcode = item.barCde ?? item.barcde ?? item.Barcde;
      if (barcode == null || String(barcode).trim().length < 3) {
        item.barCde = '101008020012';
      } else if (String(barcode).length > 30) {
        item.barCde = String(barcode).slice(0, 30);
      }

      // Normalize alternate barcode keys into barCde
      if (item.barcde != null && item.barCde == null) {
        item.barCde = item.barcde;
        delete item.barcde;
      }
    }

    // Recalculate invoice totals from line items (Postman multiline data is often out of sync)
    recalculateValDtls(payload.data);
  }

  // Export: NIC expects buyerDtls.cntry and/or expDtls.cntCode
  if (payload.data.buyerDtls) {
    const buyer = payload.data.buyerDtls;
    if (!buyer.cntry && (buyer.country_code || buyer.CountryCode)) {
      buyer.cntry = buyer.country_code || buyer.CountryCode;
    }
    if (payload.data.tranDtls?.supTyp?.startsWith('EXP') && !buyer.cntry) {
      buyer.cntry = 'US';
    }
  }

  if (String(payload.data.tranDtls?.supTyp || '').startsWith('EXP')) {
    if (!payload.data.expDtls) payload.data.expDtls = {};
    const country =
      payload.data.expDtls.cntCode ||
      payload.data.buyerDtls?.cntry ||
      payload.data.buyerDtls?.country_code ||
      'US';
    payload.data.expDtls.cntCode = country;
    if (!payload.data.expDtls.forCur) payload.data.expDtls.forCur = 'USD';
    if (payload.data.buyerDtls && !payload.data.buyerDtls.cntry) {
      payload.data.buyerDtls.cntry = country;
    }
  }

  return { payload, docNo, docDate };
}

function recalculateValDtls(data: Record<string, any>) {
  const items = data.itemList || [];
  if (!items.length) return;

  const assVal = sum(items, 'assAmt');
  const cgstVal = sum(items, 'cgstAmt');
  const sgstVal = sum(items, 'sgstAmt');
  const igstVal = sum(items, 'igstAmt');
  const cesVal =
    sum(items, 'cesAmt') + sum(items, 'cesNonAdvlAmt') + sum(items, 'cessAmot') + sum(items, 'cessAmt');
  const stCesVal = sum(items, 'stateCesAmt') + sum(items, 'stateCesNonAdvlAmt');
  const itemOth = sum(items, 'othChrg');
  const totItemVal = sum(items, 'totItemVal');

  if (!data.valDtls) data.valDtls = {};
  const headerOth = Number(data.valDtls.othChrg || 0);
  const rndOffAmt = Number(data.valDtls.rndOffAmt || 0);

  data.valDtls.assVal = assVal;
  data.valDtls.cgstVal = cgstVal;
  data.valDtls.sgstVal = sgstVal;
  data.valDtls.igstVal = igstVal;
  if (data.valDtls.cesVal != null || data.valDtls.cessVal != null || cesVal) {
    if (data.valDtls.cessVal != null) data.valDtls.cessVal = cesVal;
    else data.valDtls.cesVal = cesVal;
  }
  if (data.valDtls.stCesVal != null) data.valDtls.stCesVal = stCesVal;

  // Prefer totItemVal sum + header other charges; fall back to tax components
  const calculated =
    totItemVal > 0
      ? totItemVal + headerOth + rndOffAmt
      : assVal + cgstVal + sgstVal + igstVal + cesVal + stCesVal + itemOth + headerOth + rndOffAmt;

  data.valDtls.totInvVal = Number(calculated.toFixed(2));
}

function sum(items: Record<string, any>[], key: string): number {
  return items.reduce((acc, item) => acc + Number(item[key] || 0), 0);
}
