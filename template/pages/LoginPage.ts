import { Page, expect } from '@playwright/test';
import { eInvoiceConfig } from '../config/eInvoice.config';

/**
 * GSTHero portal login (GspModel)
 * Flow: email → Continue → password → Sign In / Continue
 */
export class LoginPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto(eInvoiceConfig.uiLoginUrl, { waitUntil: 'networkidle' });
  }

  async login(email = eInvoiceConfig.uiEmail, password = eInvoiceConfig.uiPassword) {
    await this.goto();
    await this.page.locator('#email').fill(email);
    await this.page.locator('input[type=submit][value="Continue"]').click();
    await this.page.locator('#password').waitFor({ state: 'visible', timeout: 20000 });
    await this.page.locator('#password').fill(password);

    const signIn = this.page.locator('input[type=submit][value="Sign In"]');
    if (await signIn.isVisible().catch(() => false)) {
      await signIn.click();
    } else {
      await this.page.locator('input[type=submit][value="Continue"]').click();
    }

    await this.page.waitForURL(/bo-dashboard|\/user\//i, { timeout: 60000 });
    await expect(this.page).toHaveURL(/GspModel\/user/i);
  }
}
