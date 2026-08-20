import { Page, expect } from '@playwright/test';
import { eInvoiceConfig } from '../config/eInvoice.config';

/**
 * BO Business Dashboard — select E-Invoice product and open GSTIN workspace
 */
export class BusinessDashboardPage {
  constructor(private readonly page: Page) {}

  async openMyBusiness() {
    await this.page.locator('a', { hasText: /My Business/i }).first().click();
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.locator('#EINVOICE_PRODUCTBOX, [data-type="EINVOICE"]').first().waitFor({
      state: 'visible',
      timeout: 30000,
    });
  }

  async selectEInvoiceProduct() {
    await this.page.locator('#EINVOICE_PRODUCTBOX .productBox, [data-type="EINVOICE"]').first().click();
    await this.page
      .locator('a.gotoClientDashBtn, a.disableAnchorSubmit', { hasText: /Process E-Invoice/i })
      .first()
      .waitFor({ state: 'visible', timeout: 30000 });
  }

  async openEInvoiceForGstin(gstin = eInvoiceConfig.gstin) {
    const search = this.page.locator('#businessesTable_filter input, input[type=search]').first();
    await search.waitFor({ state: 'visible', timeout: 20000 });
    await search.fill(gstin);
    await this.page.waitForTimeout(1500);

    const processBtn = this.page.locator(`a.gotoClientDashBtn[gstin="${gstin}"]`).first();
    await expect(processBtn, `Process E-Invoice not found for GSTIN ${gstin}`).toBeVisible({
      timeout: 20000,
    });
    await processBtn.click();
    await this.page.waitForURL(/e-invoice/, { timeout: 60000 });
    await expect(this.page).toHaveURL(new RegExp(`gstinNumber=${gstin}|e-invoice`, 'i'));
  }

  /** Full path: My Business → E-Invoice → Process for GSTIN */
  async openEInvoiceWorkspace(gstin = eInvoiceConfig.gstin) {
    await this.openMyBusiness();
    await this.selectEInvoiceProduct();
    await this.openEInvoiceForGstin(gstin);
  }
}
