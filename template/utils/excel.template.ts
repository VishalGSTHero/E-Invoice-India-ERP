import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import { todayDocDate } from './helpers';

export type PreparedTemplate = {
  outputPath: string;
  /** Unique document numbers written into the Excel (one per invoice) */
  docNumbers: string[];
};

/**
 * NIC document number: ^([a-zA-Z1-9]{1}[a-zA-Z0-9/-]{0,15})$  — max 16
 */
export function uniqueInvoiceNo(index: number, prefix = 'V'): string {
  const clean = prefix.replace(/[^a-zA-Z1-9]/g, '').slice(0, 1) || 'V';
  const ts = Date.now().toString().slice(-8);
  const seq = String(index + 1).padStart(2, '0');
  return `${clean}${ts}${seq}`.slice(0, 16);
}

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const joined = (rows[i] || []).map((c) => String(c || '')).join('|');
    if (/Document Number/i.test(joined)) return i;
  }
  return -1;
}

function findCol(header: any[], patterns: RegExp[]): number {
  for (let i = 0; i < header.length; i++) {
    const h = String(header[i] || '');
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}

function stateFromGstin(gstin: unknown): string {
  const g = String(gstin ?? '')
    .trim()
    .toUpperCase();
  if (!g || g === 'URP' || g.length < 2) return '';
  const state = g.slice(0, 2);
  return /^\d{2}$/.test(state) ? state : '';
}

function toAmount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function formatAmount(n: number): string {
  return n.toFixed(2);
}

/**
 * Inter-state (buyer GSTIN state ≠ supplier/05): move CGST+SGST into IGST.
 * Intra-state (buyer state = 05): keep/split as CGST+SGST.
 */
function applyTaxTypeForBuyerState(
  row: any[],
  cols: {
    buyerGstinIdx: number;
    supplierGstinIdx: number;
    cgstIdx: number;
    sgstIdx: number;
    igstIdx: number;
    totalCgstIdx: number;
    totalSgstIdx: number;
    totalIgstIdx: number;
    taxableIdx: number;
    rateIdx: number;
  },
  sellerStateFallback = '05'
) {
  const buyerState = stateFromGstin(
    cols.buyerGstinIdx >= 0 ? row[cols.buyerGstinIdx] : ''
  );
  const supplierState =
    stateFromGstin(cols.supplierGstinIdx >= 0 ? row[cols.supplierGstinIdx] : '') ||
    sellerStateFallback;

  // No usable buyer state (blank / URP) — leave as-is
  if (!buyerState) return;

  const cgst = cols.cgstIdx >= 0 ? toAmount(row[cols.cgstIdx]) : 0;
  const sgst = cols.sgstIdx >= 0 ? toAmount(row[cols.sgstIdx]) : 0;
  let igst = cols.igstIdx >= 0 ? toAmount(row[cols.igstIdx]) : 0;
  const totalCgst = cols.totalCgstIdx >= 0 ? toAmount(row[cols.totalCgstIdx]) : 0;
  const totalSgst = cols.totalSgstIdx >= 0 ? toAmount(row[cols.totalSgstIdx]) : 0;
  let totalIgst = cols.totalIgstIdx >= 0 ? toAmount(row[cols.totalIgstIdx]) : 0;

  const isInterState = buyerState !== supplierState;

  if (isInterState) {
    // Prefer existing IGST; otherwise convert CGST+SGST → IGST
    if (igst <= 0 && cgst + sgst > 0) igst = cgst + sgst;
    if (igst <= 0) {
      const taxable = cols.taxableIdx >= 0 ? toAmount(row[cols.taxableIdx]) : 0;
      const rate = cols.rateIdx >= 0 ? toAmount(row[cols.rateIdx]) : 0;
      if (taxable > 0 && rate > 0) igst = (taxable * rate) / 100;
    }
    if (totalIgst <= 0 && totalCgst + totalSgst > 0) totalIgst = totalCgst + totalSgst;
    if (totalIgst <= 0 && igst > 0) totalIgst = igst;

    if (cols.cgstIdx >= 0) row[cols.cgstIdx] = formatAmount(0);
    if (cols.sgstIdx >= 0) row[cols.sgstIdx] = formatAmount(0);
    if (cols.igstIdx >= 0) row[cols.igstIdx] = formatAmount(igst);
    if (cols.totalCgstIdx >= 0) row[cols.totalCgstIdx] = formatAmount(0);
    if (cols.totalSgstIdx >= 0) row[cols.totalSgstIdx] = formatAmount(0);
    if (cols.totalIgstIdx >= 0) row[cols.totalIgstIdx] = formatAmount(totalIgst);
  } else {
    // Intra-state (buyer also 05): use CGST+SGST, clear IGST
    if (cgst + sgst <= 0 && igst > 0) {
      const half = igst / 2;
      if (cols.cgstIdx >= 0) row[cols.cgstIdx] = formatAmount(half);
      if (cols.sgstIdx >= 0) row[cols.sgstIdx] = formatAmount(half);
    }
    if (totalCgst + totalSgst <= 0 && totalIgst > 0) {
      const half = totalIgst / 2;
      if (cols.totalCgstIdx >= 0) row[cols.totalCgstIdx] = formatAmount(half);
      if (cols.totalSgstIdx >= 0) row[cols.totalSgstIdx] = formatAmount(half);
    }
    if (cols.igstIdx >= 0) row[cols.igstIdx] = formatAmount(0);
    if (cols.totalIgstIdx >= 0) row[cols.totalIgstIdx] = formatAmount(0);
  }
}

/**
 * Copy template Excel and replace every Document Number with a unique value
 * (same original invoice number → same new number across line-item rows).
 * Also refreshes Document Date to today and corrects CGST/SGST vs IGST
 * based on buyer GSTIN state (≠ 05 / supplier → IGST).
 */
export function prepareUniqueTemplate(
  sourcePath: string,
  outputDir = path.resolve(process.cwd(), 'test-results', 'upload-templates'),
  sellerStateFallback = '05'
): PreparedTemplate {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Template not found: ${sourcePath}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputPath = path.join(
    outputDir,
    `${path.basename(sourcePath, path.extname(sourcePath))}_unique_${stamp}.xlsx`
  );

  const wb = XLSX.readFile(sourcePath);
  const sheetName =
    wb.SheetNames.find((n) => /einvoice/i.test(n)) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    raw: true,
  });

  const headerRowIdx = findHeaderRow(rows);
  if (headerRowIdx < 0) {
    throw new Error(`Could not find Document Number header in ${sourcePath}`);
  }

  const header = rows[headerRowIdx];
  const docIdx = findCol(header, [
    /^Document Number/i,
    /Document Number \(\*\)/i,
    /Invoice \/ Document Details-Document Number/i,
  ]);
  const dateIdx = findCol(header, [
    /^Document Date/i,
    /Document Date \(\*\)/i,
    /Invoice \/ Document Details-Document Date/i,
  ]);

  const taxCols = {
    buyerGstinIdx: findCol(header, [/^Buyer GSTIN/i, /Buyer Details-Buyer GSTIN/i]),
    supplierGstinIdx: findCol(header, [/^Supplier GSTIN/i, /Seller Details-Supplier GSTIN/i]),
    cgstIdx: findCol(header, [/^CGST Amount$/i, /Item Tax Details-CGST Amount/i]),
    sgstIdx: findCol(header, [/^SGST Amount$/i, /Item Tax Details-SGST Amount/i]),
    igstIdx: findCol(header, [/^IGST Amount$/i, /Item Tax Details-IGST Amount/i]),
    totalCgstIdx: findCol(header, [/Total CGST Value/i]),
    totalSgstIdx: findCol(header, [/Total SGST Value/i]),
    totalIgstIdx: findCol(header, [/Total IGST Value/i]),
    taxableIdx: findCol(header, [/^Taxable Value/i, /Item Details-Taxable Value/i]),
    rateIdx: findCol(header, [/^GST rate/i, /Item Tax Details-GST rate/i]),
  };

  if (docIdx < 0) {
    throw new Error(`Document Number column not found in sheet "${sheetName}"`);
  }

  const today = todayDocDate();
  const remap = new Map<string, string>();
  const docNumbers: string[] = [];
  let nextIndex = 0;
  let interStateFixed = 0;

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row.length) continue;

    const rawDoc = row[docIdx];
    const docKey = String(rawDoc ?? '').trim();
    if (!docKey) continue;

    if (!remap.has(docKey)) {
      const unique = uniqueInvoiceNo(nextIndex++);
      remap.set(docKey, unique);
      docNumbers.push(unique);
    }
    row[docIdx] = remap.get(docKey);

    if (dateIdx >= 0) {
      row[dateIdx] = today;
    }

    const buyerState = stateFromGstin(
      taxCols.buyerGstinIdx >= 0 ? row[taxCols.buyerGstinIdx] : ''
    );
    const beforeIgst = taxCols.igstIdx >= 0 ? toAmount(row[taxCols.igstIdx]) : 0;
    const beforeCgst = taxCols.cgstIdx >= 0 ? toAmount(row[taxCols.cgstIdx]) : 0;
    applyTaxTypeForBuyerState(row, taxCols, sellerStateFallback);
    const afterIgst = taxCols.igstIdx >= 0 ? toAmount(row[taxCols.igstIdx]) : 0;
    const afterCgst = taxCols.cgstIdx >= 0 ? toAmount(row[taxCols.cgstIdx]) : 0;
    if (
      buyerState &&
      buyerState !== sellerStateFallback &&
      (afterIgst !== beforeIgst || afterCgst !== beforeCgst)
    ) {
      interStateFixed++;
    }
  }

  if (docNumbers.length === 0) {
    throw new Error(`No invoice document numbers found in ${sourcePath}`);
  }

  const newSheet = XLSX.utils.aoa_to_sheet(rows);
  wb.Sheets[sheetName] = newSheet;
  XLSX.writeFile(wb, outputPath);

  console.log(
    `Prepared unique template: ${path.basename(outputPath)} (${docNumbers.length} invoices)`
  );
  console.log('Doc Nos:', docNumbers.join(', '));
  if (interStateFixed > 0) {
    console.log(
      `Tax type fixed to IGST for ${interStateFixed} inter-state row(s) (buyer GSTIN state ≠ ${sellerStateFallback})`
    );
  }

  return { outputPath, docNumbers };
}
