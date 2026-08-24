import fs from 'fs';
import path from 'path';
import { Download, Page, expect } from '@playwright/test';
import { eInvoiceConfig } from '../config/eInvoice.config';
import { prepareUniqueTemplate } from '../utils/excel.template';

/**
 * E-Invoice UI — template mapping, upload, generate (submit), PDF download
 */
export class EInvoiceTemplatePage {
  constructor(private readonly page: Page) {}

  /** Prefer in-app nav; fall back to direct URL (session GSTIN must already be set). */
  private async goToPath(pathSuffix: string, linkSelector: string) {
    const link = this.page.locator(linkSelector).first();
    if (await link.isVisible().catch(() => false)) {
      await Promise.all([
        this.page.waitForURL(new RegExp(pathSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
          timeout: 60000,
        }),
        link.click(),
      ]);
      return;
    }
    await this.page.goto(`${eInvoiceConfig.baseUrl}/GspModel${pathSuffix}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.page.waitForURL(new RegExp(pathSuffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), {
      timeout: 60000,
    });
  }

  async openUploadData() {
    await this.goToPath(
      '/user/bo/e-invoice-upload-file',
      'a[href*="e-invoice-upload-file"]'
    );
  }

  async openChangeMapping() {
    await this.goToPath(
      '/user/bo/e-invoice-excel-mapping-step1',
      'a[href*="e-invoice-excel-mapping-step1"], a:has-text("Change Mapping")'
    );
  }

  /**
   * 1) Map template — Excel + GST Hero Excel Template Version 1.0 (code 102)
   */
  async mapTemplate(connectorCode = eInvoiceConfig.templateConnectorCode) {
    await this.openUploadData();
    await this.openChangeMapping();

    const excelRadio = this.page.locator('input[name="mappingFileType"][value="excel"]');
    await excelRadio.waitFor({ state: 'attached', timeout: 30000 });
    await excelRadio.evaluate((el: HTMLInputElement) => {
      el.click();
    });
    const templateSelect = this.page.locator('#einvtemplateList');
    await templateSelect.waitFor({ state: 'visible', timeout: 15000 });

    const labelByCode: Record<string, string> = {
      '102': 'GST Hero Excel Template Version 1.0',
      '301': 'GST Hero Excel Template Version 2.0',
    };
    const label = labelByCode[String(connectorCode)] ?? String(connectorCode);
    await templateSelect.selectOption({ label });
    await expect(templateSelect.locator('option:checked')).toHaveText(label);

    await Promise.all([
      this.page.waitForURL(/e-invoice-excel-mapping-step2/, { timeout: 120000 }),
      this.page.getByRole('button', { name: /^Process & Next$/i }).click(),
    ]);

    const processStep2 = this.page
      .locator(
        '.einvDataMappingProcess, #processAndNextButton, #processBtn, button:has-text("Process & Next")'
      )
      .first();
    await processStep2.waitFor({ state: 'visible', timeout: 60000 });
    await Promise.all([
      this.page.waitForURL(/e-invoice-upload-file/, { timeout: 120000 }),
      processStep2.click(),
    ]);

    await expect(this.page).toHaveURL(/e-invoice-upload-file/);
  }

  /**
   * 2) Upload Excel — invoice numbers are uniquified on every upload
   */
  async uploadTemplate(filePath = eInvoiceConfig.templateFilePath): Promise<string[]> {
    expect(fs.existsSync(filePath), `Template not found: ${filePath}`).toBeTruthy();

    if (!/e-invoice-upload-file/.test(this.page.url())) {
      await this.openUploadData();
    }

    const { outputPath, docNumbers } = prepareUniqueTemplate(filePath);

    await this.page.locator('#einvFile').setInputFiles(outputPath);
    const fileName = path.basename(outputPath);
    await expect(this.page.locator(`text=${fileName}`).first()).toBeVisible({ timeout: 15000 });

    await Promise.all([
      this.page.waitForURL(/e-invoice(\?|$)/, { timeout: 180000 }),
      this.page.locator('#processAndNextBtn, button.einvUploadFile').first().click(),
    ]);

    await expect(this.page).toHaveURL(/e-invoice/);
    await this.waitForUploadValidation(docNumbers);
    return docNumbers;
  }

  /**
   * Poll upload banner until validation/export finishes.
   * If stuck on "Export In Progress", keep clicking Refresh — status then becomes
   * "Error In Records" or "Validation Completed". Then Ready-to-Generate rows can be selected.
   */
  private async waitForUploadValidation(docNumbers: string[], timeoutMs = 300000) {
    const deadline = Date.now() + timeoutMs;
    let lastStatus = '';
    let exportRefreshCount = 0;

    while (Date.now() < deadline) {
      const statusText = await this.readUploadBannerStatus();
      lastStatus = statusText;

      const inProgress = /Validation In Progress|Export In Progress/i.test(statusText);
      const finished =
        /Error\s*In\s*Records|Validation\s*Completed|Success|Completed/i.test(statusText) &&
        !inProgress;

      if (/Export In Progress/i.test(statusText)) {
        exportRefreshCount++;
        console.log(
          `Export In Progress — refresh #${exportRefreshCount} (expect Error In Records / Validation Completed):`,
          statusText
        );
        await this.clickUploadStatusRefresh();
        await this.page.waitForTimeout(4000);
        // Soft-refresh invoice table without full page.reload (reload can hang on export)
        if (exportRefreshCount % 3 === 0) {
          await this.refreshInvoiceListSoft();
        }
        continue;
      }

      if (/Validation In Progress/i.test(statusText)) {
        console.log('Waiting for validation:', statusText);
        await this.clickUploadStatusRefresh();
        await this.page.waitForTimeout(4000);
        continue;
      }

      if (finished) {
        console.log('Upload finished with status:', statusText);
        await this.refreshInvoiceListSoft();
        return;
      }

      // Banner idle/unknown — check if Ready rows or uploaded docs already appear
      await this.clickUploadStatusRefresh();
      await this.page.waitForTimeout(2000);
      await this.refreshInvoiceListSoft();

      const readyCount = await this.countReadyToGenerateRows();
      const foundDoc = docNumbers.length
        ? await this.page.locator(`text=${docNumbers[0]}`).first().isVisible().catch(() => false)
        : false;

      if (readyCount > 0 || foundDoc) {
        console.log(`Upload list ready. foundDoc=${foundDoc} ready≈${readyCount}`);
        return;
      }

      await this.page.waitForTimeout(3000);
    }

    // Last chance: refresh once more and proceed if any Ready rows exist
    await this.clickUploadStatusRefresh();
    await this.refreshInvoiceListSoft();
    const readyAfterTimeout = await this.countReadyToGenerateRows();
    console.log(
      `Timed out waiting for validation. Last status: ${lastStatus}; ready≈${readyAfterTimeout}`
    );
    if (readyAfterTimeout === 0) {
      throw new Error(
        `Upload did not finish (Error In Records / Validation Completed). Last status: ${lastStatus}`
      );
    }
  }

  private async readUploadBannerStatus(): Promise<string> {
    return (
      await this.page
        .locator('text=/Last Uploaded/i')
        .first()
        .innerText({ timeout: 5000 })
        .catch(() => '')
    ).replace(/\s+/g, ' ');
  }

  /** Click the Upload Data / Refresh control next to Last Uploaded status. */
  private async clickUploadStatusRefresh() {
    const candidates = [
      this.page.locator('text=/Last Uploaded/i').locator('xpath=ancestor::div[1]//button').first(),
      this.page.getByRole('button', { name: /refresh/i }).first(),
      this.page.locator('button:has-text("Refresh")').first(),
      this.page.locator('a:has-text("Refresh")').first(),
    ];
    for (const btn of candidates) {
      if (await btn.isVisible().catch(() => false)) {
        await btn.click({ timeout: 5000 }).catch(() => {});
        return;
      }
    }
    // Force-click first matching button even if covered
    await this.page
      .locator('text=/Last Uploaded/i')
      .locator('xpath=ancestor::div[1]//button')
      .first()
      .click({ force: true, timeout: 5000 })
      .catch(() => {});
  }

  /** Refresh DataTables list without hanging full page.reload. */
  private async refreshInvoiceListSoft() {
    await this.page
      .evaluate(() => {
        const w = window as unknown as {
          jQuery?: (sel: string) => { DataTable?: () => { ajax: { reload: (cb: null, resetPaging: boolean) => void } } };
        };
        try {
          w.jQuery?.('#pendingActions')?.DataTable?.()?.ajax?.reload(null, false);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
    await this.page.waitForTimeout(2000);
  }

  private async countReadyToGenerateRows(): Promise<number> {
    return this.page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('#pendingActions tbody tr, table tbody tr')
      );
      let count = 0;
      for (const row of rows) {
        const text = (row.textContent || '').replace(/\s+/g, ' ');
        if (/ready to generate/i.test(text) && !/error/i.test(text)) count++;
      }
      return count;
    });
  }

  /**
   * "Authentication E-Invoice User" modal — NIC credentials from
   * EINV_AUTH_USER / EINV_AUTH_PASS in .env
   */
  private async fillEInvoiceAuthIfNeeded(timeoutMs = 20000) {
    const modal = this.page
      .locator('.modal.in, .modal.show, #authEinvUserModal, .modal-auth-einvoice-user')
      .filter({ hasText: /Authentication E-Invoice User/i })
      .first();
    const user = this.page.locator('#einvUserName');
    const password = this.page.locator('#einvPassword');
    const submit = this.page.locator('#einvSubmit');

    // Wait briefly — modal may open a second after Generate
    const appeared = await Promise.race([
      user.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true),
      modal.waitFor({ state: 'visible', timeout: timeoutMs }).then(() => true),
      this.page
        .getByText(/Authentication E-Invoice User/i)
        .first()
        .waitFor({ state: 'visible', timeout: timeoutMs })
        .then(() => true),
    ]).catch(() => false);

    if (!appeared && !(await user.isVisible().catch(() => false))) {
      console.log('E-Invoice auth modal not shown — continuing');
      return;
    }

    await user.waitFor({ state: 'visible', timeout: 10000 });
    expect(
      eInvoiceConfig.authUsername,
      'Set EINV_AUTH_USER (e.g. perennialsys_UK) for E-Invoice auth modal'
    ).toBeTruthy();
    expect(
      eInvoiceConfig.authPassword,
      'Set EINV_AUTH_PASS for E-Invoice auth modal'
    ).toBeTruthy();

    await user.fill(eInvoiceConfig.authUsername);
    await password.fill(eInvoiceConfig.authPassword);

    const savePwd = this.page.locator('#passwordSave, input[name="PasswordSave"]');
    if (await savePwd.isVisible().catch(() => false)) {
      await savePwd.check({ force: true }).catch(() => {});
    }

    console.log(
      `Filled Authentication E-Invoice User as ${eInvoiceConfig.authUsername}`
    );
    await submit.click();

    // Wait for modal to close / generation to proceed
    await user.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {});
    await this.page.waitForTimeout(3000);
  }

  private async clearListFilters() {
    await this.page
      .evaluate(() => {
        document
          .querySelectorAll('.clearDateFilter, .filter-clear, [id*=clearDate], a.clear-filter')
          .forEach((b) => (b as HTMLElement).click());
      })
      .catch(() => {});

    const clearIcon = this.page.locator('.fa-times, .filter-clear').first();
    if (await clearIcon.isVisible().catch(() => false)) {
      await clearIcon.click().catch(() => {});
    }
    await this.page.waitForTimeout(800);
  }

  /**
   * Select only rows ready to generate (exclude Error / Generated / Cancelled).
   * When expectedDocNos is provided, select only those docs — never bulk historical rows.
   */
  private async selectReadyToGenerateRows(expectedDocNos: string[] = []): Promise<number> {
    const lengthSelect = this.page.locator('select[name="pendingActions_length"]').first();
    if (await lengthSelect.count()) {
      await lengthSelect.selectOption('500').catch(() => {});
      await this.page.waitForTimeout(1000);
    }

    const checkAll = this.page.locator('#checkPendingActionsRecord').first();
    if (await checkAll.count()) {
      await checkAll.uncheck({ force: true }).catch(() => {});
    }

    // Prefer selecting only invoices from this upload
    if (expectedDocNos.length) {
      return this.page.evaluate((docs) => {
        let count = 0;
        const rows = Array.from(
          document.querySelectorAll('#pendingActions tbody tr, table tbody tr')
        );
        for (const row of rows) {
          const text = (row.textContent || '').replace(/\s+/g, ' ');
          if (!docs.some((d) => text.includes(d))) continue;
          if (/error/i.test(text)) continue;
          if (/\bGENERATED\b|\bCANCELLED\b/i.test(text)) continue;
          if (!/ready to generate|pending/i.test(text)) continue;
          const cb = row.querySelector(
            'input.checkSingle, input[type=checkbox]'
          ) as HTMLInputElement | null;
          if (cb && !cb.disabled) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change', { bubbles: true }));
            count++;
          }
        }
        return count;
      }, expectedDocNos);
    }

    return this.page.evaluate(() => {
      const rows = Array.from(
        document.querySelectorAll('#pendingActions tbody tr, table tbody tr')
      );
      let count = 0;
      for (const row of rows) {
        const text = (row.textContent || '').replace(/\s+/g, ' ');
        const isError = /error/i.test(text);
        const isGenerated = /\bGENERATED\b/i.test(text);
        const isCancelled = /\bCANCELLED\b/i.test(text);
        const isReady = /ready to generate/i.test(text);
        if (!isReady || isError || isGenerated || isCancelled) continue;

        const cb = row.querySelector(
          'input[type=checkbox].checkSingle, input[type=checkbox]'
        ) as HTMLInputElement | null;
        if (cb && !cb.disabled) {
          cb.checked = true;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
          count++;
        }
      }
      return count;
    });
  }

  /**
   * 3) Submit / Generate IRN only for Ready-to-Generate (valid) invoices
   */
  async submitInvoice(expectedDocNos: string[] = []) {
    if (!/\/e-invoice(\?|$)/.test(this.page.url())) {
      await this.page.locator('a', { hasText: /^E-Invoice$/i }).first().click().catch(async () => {
        await this.page.goto(`${eInvoiceConfig.baseUrl}/GspModel/user/bo/e-invoice`, {
          waitUntil: 'domcontentloaded',
        });
      });
      await this.page.waitForTimeout(2000);
    }

    await this.clearListFilters();

    const statusFilter = this.page.locator('#filterEinvStatus');
    if (await statusFilter.count()) {
      // With known uploaded docs, start on View All so new rows are visible
      const preferViewAll = expectedDocNos.length > 0;
      const options = await statusFilter.locator('option').allTextContents();
      const readyOpt = options.find((o) => /ready to generate/i.test(o));
      const allOpt = options.find((o) => /view all|all/i.test(o.trim()));
      const pendingOpt = options.find((o) => /pending/i.test(o.trim()));
      const targetLabel = (
        preferViewAll ? allOpt || readyOpt : readyOpt || pendingOpt || allOpt || ''
      ).trim();

      if (targetLabel) {
        await statusFilter
          .evaluate((el: HTMLSelectElement, label: string) => {
            const opt = Array.from(el.options).find(
              (o) => o.text.trim().toLowerCase() === label.toLowerCase()
            );
            if (!opt) return false;
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }, targetLabel)
          .catch(() => false);
      }
      await this.page.waitForTimeout(2000);
    }

    let selected = await this.selectReadyToGenerateRows(expectedDocNos);

    // After Error In Records / Validation Completed — refresh until this upload's Ready rows show
    for (let attempt = 0; attempt < 12 && selected === 0; attempt++) {
      const banner = await this.readUploadBannerStatus();
      console.log(
        `No ready rows for uploaded docs yet — refresh ${attempt + 1}/12 | ${banner}`
      );
      await this.clickUploadStatusRefresh();
      await this.page.waitForTimeout(4000);
      await this.refreshInvoiceListSoft();

      const sf = this.page.locator('#filterEinvStatus');
      if (await sf.count()) {
        // Alternate Ready filter / View All so new upload rows surface
        const useReady = attempt % 2 === 0;
        await sf
          .evaluate((el: HTMLSelectElement, ready: boolean) => {
            const opt = Array.from(el.options).find((o) =>
              ready ? /ready to generate/i.test(o.text) : /view all|all/i.test(o.text)
            );
            if (!opt) return false;
            el.value = opt.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }, useReady)
          .catch(() => false);
        await this.page.waitForTimeout(2000);
      }

      selected = await this.selectReadyToGenerateRows(expectedDocNos);
    }

    expect(selected, 'No Ready-to-Generate invoices found to submit').toBeGreaterThan(0);
    console.log(`Selected ${selected} ready-to-generate invoice(s) for Generate`);

    await this.page.locator('#generateBulkEInv').click();

    // Auth modal may open slightly after Generate; poll and fill NIC credentials
    await this.fillEInvoiceAuthIfNeeded(30000);

    // Allow IRN generation — scale wait with selection size (cap ~90s)
    const genWaitMs = Math.min(90000, 8000 + selected * 3000);
    console.log(`Waiting ${genWaitMs}ms for IRN generation of ${selected} invoice(s)`);
    await this.page.waitForTimeout(genWaitMs);
    await this.clickUploadStatusRefresh();
    await this.refreshInvoiceListSoft();
    await this.page.waitForTimeout(2000);

    await expect(this.page.locator('#generateBulkEInv')).toBeVisible({ timeout: 30000 });
  }

  /**
   * 4) Download PDF for a GENERATED invoice
   */
  async downloadPdf(downloadDir = path.resolve(process.cwd(), 'test-results', 'downloads')): Promise<string> {
    fs.mkdirSync(downloadDir, { recursive: true });
    await this.clearListFilters();

    const statusFilter = this.page.locator('#filterEinvStatus');
    if (await statusFilter.count()) {
      await statusFilter
        .evaluate((el: HTMLSelectElement) => {
          const opt = Array.from(el.options).find((o) => /generated/i.test(o.text));
          if (!opt) return;
          el.value = opt.value;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        })
        .catch(() => {});
      await this.page.waitForTimeout(2500);
    }

    const lengthSelect = this.page.locator('select[name="pendingActions_length"]').first();
    if (await lengthSelect.count()) {
      await lengthSelect.selectOption('50').catch(() => {});
      await this.page.waitForTimeout(1000);
    }

    const saveDownload = async (download: Download) => {
      const suggested = download.suggestedFilename() || `einvoice-${Date.now()}.pdf`;
      const target = path.join(
        downloadDir,
        suggested.endsWith('.pdf') ? suggested : `${suggested}.pdf`
      );
      await download.saveAs(target);
      expect(fs.existsSync(target)).toBeTruthy();
      expect(fs.statSync(target).size).toBeGreaterThan(0);
      return target;
    };

    const rowPdf = this.page.locator('button[title="Download PDF file to Print"]').first();
    await rowPdf.waitFor({ state: 'visible', timeout: 30000 }).catch(() => null);

    if (await rowPdf.isVisible().catch(() => false)) {
      await rowPdf
        .locator('xpath=ancestor::tr//input[@type="checkbox"]')
        .check({ force: true })
        .catch(() => {});

      const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
      const popupPromise = this.page.waitForEvent('popup', { timeout: 15000 }).catch(() => null);
      await rowPdf.evaluate((el: HTMLElement) => el.click());

      const download = await downloadPromise;
      if (download) return saveDownload(download);

      const popup = await popupPromise;
      if (popup) {
        const pdfResp = await popup
          .waitForResponse(
            (r) => /pdf/i.test(r.headers()['content-type'] || '') || /\.pdf/i.test(r.url()),
            { timeout: 30000 }
          )
          .catch(() => null);
        if (pdfResp) {
          const body = await pdfResp.body();
          const target = path.join(downloadDir, `einvoice-${Date.now()}.pdf`);
          fs.writeFileSync(target, body);
          expect(body.length).toBeGreaterThan(0);
          return target;
        }
      }

      const previewBtn = this.page.locator('#download-preview-btn').first();
      if (await previewBtn.isVisible().catch(() => false)) {
        const [d] = await Promise.all([
          this.page.waitForEvent('download', { timeout: 60000 }),
          previewBtn.click(),
        ]);
        return saveDownload(d);
      }
    }

    const generatedCheck = this.page
      .locator('table#pendingActions tbody tr')
      .filter({ hasText: /GENERATED/i })
      .locator('input[type=checkbox]')
      .first();
    if (await generatedCheck.count()) {
      await generatedCheck.evaluate((el: HTMLInputElement) => {
        el.checked = true;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });
    } else {
      const checkAll = this.page.locator('#checkPendingActionsRecord').first();
      if (await checkAll.count()) {
        await checkAll.evaluate((el: HTMLInputElement) => {
          el.checked = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }).catch(() => {});
      }
    }

    await this.page.locator('#exportBtn').click();
    const pdfLink = this.page.locator('a.downloadFile[type="pdf"]').first();
    await expect(pdfLink).toBeVisible({ timeout: 10000 });

    const downloadPromise = this.page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
    const responsePromise = this.page
      .waitForResponse(
        (r) =>
          r.ok() &&
          (/pdf/i.test(r.headers()['content-type'] || '') ||
            /pdf|print|download/i.test(r.url())),
        { timeout: 60000 }
      )
      .catch(() => null);

    await pdfLink.click();

    const download = await downloadPromise;
    if (download) return saveDownload(download);

    const resp = await responsePromise;
    if (resp) {
      const body = await resp.body();
      const target = path.join(downloadDir, `einvoice-export-${Date.now()}.pdf`);
      fs.writeFileSync(target, body);
      expect(body.length).toBeGreaterThan(0);
      return target;
    }

    throw new Error(
      'PDF download did not start. Ensure at least one GENERATED e-invoice is visible.'
    );
  }
}
