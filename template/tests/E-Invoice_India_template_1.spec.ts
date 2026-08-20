import fs from 'fs';
import path from 'path';
import { test, expect } from '@playwright/test';
import { eInvoiceConfig } from '../config/eInvoice.config';
import { LoginPage } from '../pages/LoginPage';
import { BusinessDashboardPage } from '../pages/BusinessDashboardPage';
import { EInvoiceTemplatePage } from '../pages/EInvoiceTemplatePage';

/**
 * E-Invoice India — Template 1 (GST Hero Excel Template Version 1.0)
 *
 * 1) Map template
 * 2) Upload template (invoice nos uniquified every run; file may mix valid + error rows)
 * 3) Submit only Ready-to-Generate invoices
 * 4) Download PDF
 *
 * Portal: https://dev.gsthero.com/GspModel/login
 * Product: E-Invoice | GSTIN from EINV_GSTIN
 */
test.describe.configure({ mode: 'serial', timeout: 600_000 });

test.describe('E-Invoice India - Template 1', () => {
  let uploadedDocNos: string[] = [];

  test.beforeEach(async ({ page }) => {
    test.skip(
      !eInvoiceConfig.uiEmail || !eInvoiceConfig.uiPassword,
      'Set EINV_UI_EMAIL / EINV_UI_PASSWORD (or EINV_OAUTH_USER / EINV_OAUTH_PASS) in .env'
    );
    test.skip(
      !fs.existsSync(eInvoiceConfig.templateFilePath),
      `Template missing: ${eInvoiceConfig.templateFilePath}`
    );

    const login = new LoginPage(page);
    await login.login();

    const business = new BusinessDashboardPage(page);
    await business.openEInvoiceWorkspace(eInvoiceConfig.gstin);
  });

  test('1) Map template (Excel Version 1.0)', async ({ page }) => {
    const einv = new EInvoiceTemplatePage(page);
    await einv.mapTemplate('102');
    await expect(page).toHaveURL(/e-invoice-upload-file/);
  });

  test('2) Upload the template (unique invoice nos)', async ({ page }) => {
    const einv = new EInvoiceTemplatePage(page);
    await einv.openUploadData();
    uploadedDocNos = await einv.uploadTemplate(eInvoiceConfig.templateFilePath);
    expect(uploadedDocNos.length).toBeGreaterThan(0);
    await expect(page).toHaveURL(/e-invoice/);
  });

  test('3) Submit Ready-to-Generate invoices', async ({ page }) => {
    const einv = new EInvoiceTemplatePage(page);
    await einv.submitInvoice(uploadedDocNos);
    await expect(page.locator('text=E-Invoice').first()).toBeVisible();
  });

  test('4) Download the PDF', async ({ page }) => {
    const einv = new EInvoiceTemplatePage(page);
    if (!/\/e-invoice(\?|$)/.test(page.url())) {
      await page.locator('a', { hasText: /^E-Invoice$/i }).first().click();
      await page.waitForTimeout(2000);
    }

    const pdfPath = await einv.downloadPdf(
      path.resolve(__dirname, '../test-results/downloads')
    );
    console.log('PDF saved:', pdfPath);
    expect(fs.existsSync(pdfPath)).toBeTruthy();
  });

  test('End-to-end: map → upload (unique nos) → generate ready → PDF', async ({ page }) => {
    const einv = new EInvoiceTemplatePage(page);

    await einv.mapTemplate('102');
    const docNos = await einv.uploadTemplate(eInvoiceConfig.templateFilePath);
    expect(docNos.length).toBeGreaterThan(0);

    await einv.submitInvoice(docNos);

    const pdfPath = await einv.downloadPdf(
      path.resolve(__dirname, '../test-results/downloads')
    );
    console.log('E2E PDF saved:', pdfPath);
    expect(fs.statSync(pdfPath).size).toBeGreaterThan(0);
  });
});
