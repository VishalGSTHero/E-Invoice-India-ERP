# Split API / Template and Push to Bitbucket Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the mixed `playwrighteinvoice` Playwright project into independent `api/` and `template/` packages and push them to Bitbucket `main`.

**Architecture:** Each suite is its own Node Playwright package (own `package.json`, config, pages, tests). Root holds `bitbucket-pipelines.yml`, `README.md`, and `.gitignore`. Custom pipelines `api` and `template` run tests separately; default push only `npm ci`s both packages.

**Tech Stack:** Playwright 1.62.1, TypeScript, dotenv, xlsx (template only), Bitbucket Pipelines (`mcr.microsoft.com/playwright:v1.62.1-jammy`).

## Global Constraints

- Remote: `https://bitbucket.org/perennialsys/gsthero-automation-playwright.git` branch `main`
- Do not commit `.env`, credentials, Excel templates, reports, `node_modules/`, or `.cursor/`
- Do not rewrite Bitbucket history
- Chromium only in both Playwright configs
- No `shared/` npm package — duplicate small helpers
- Do not recreate missing `E-Invoice_India_template_ERP.spec.ts`
- Drop `tests/example.spec.ts`, `.github/workflows/daily-einvoice.yml`, and `scripts/daily-run.js`
- API `npm test` must not load Template pages; Template `npm test` must not load API pages or payloads
- Workspace is not a git repo yet — work in place (no worktree until `git init`)

---

### Task 1: Create `api/` Playwright package

**Files:**
- Create: `api/package.json`
- Create: `api/tsconfig.json`
- Create: `api/playwright.config.ts`
- Create: `api/.env.example`
- Create: `api/config/eInvoice.config.ts`
- Copy unchanged from `playwrighteinvoice/`:
  - `pages/AuthApiPage.ts` → `api/pages/AuthApiPage.ts`
  - `pages/EInvoiceApiPage.ts` → `api/pages/EInvoiceApiPage.ts`
  - `utils/helpers.ts` → `api/utils/helpers.ts`
  - `utils/payload.builder.ts` → `api/utils/payload.builder.ts`
  - `utils/scenario.loader.ts` → `api/utils/scenario.loader.ts`
  - `testdata/scenarios.json` → `api/testdata/scenarios.json`
  - `testdata/payloads/*.json` → `api/testdata/payloads/`
  - `tests/E-Invoice_India_all_api_submit.spec.ts` → `api/tests/E-Invoice_India_all_api_submit.spec.ts`

**Interfaces:**
- Consumes: existing API POM + scenarios (behavior unchanged)
- Produces: `cd api && npm test` lists only Generate IRN scenario tests; `eInvoiceConfig` has API fields only

- [ ] **Step 1: Write package files**

`api/package.json`:

```json
{
  "name": "gsthero-einvoice-api",
  "version": "1.0.0",
  "description": "GST Hero E-Invoice India Generate IRN API tests",
  "scripts": {
    "test": "playwright test --project=chromium --workers=1"
  },
  "license": "ISC",
  "type": "commonjs",
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@types/node": "^26.2.0"
  },
  "dependencies": {
    "dotenv": "^17.4.2"
  }
}
```

`api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [
    "tests/**/*.ts",
    "pages/**/*.ts",
    "config/**/*.ts",
    "utils/**/*.ts",
    "playwright.config.ts"
  ]
}
```

`api/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/daily-results.json' }],
  ],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

`api/.env.example`:

```
EINV_BASE_URL=https://dev.gsthero.com
EINV_GSTIN=05AALFP1139Q003
EINV_CONNECTOR_AUTH=testerpclient:20180519134451:05AALFP1139Q003
EINV_BASIC_AUTH=Basic REPLACE_ME
EINV_CLIENT_ID=testerpclient
EINV_CLIENT_SECRET=REPLACE_ME
EINV_OAUTH_USER=REPLACE_ME
EINV_OAUTH_PASS=REPLACE_ME
EINV_AUTH_USER=REPLACE_ME
EINV_AUTH_PASS=REPLACE_ME
```

`api/config/eInvoice.config.ts`:

```typescript
function required(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const eInvoiceConfig = {
  baseUrl: required('EINV_BASE_URL', 'https://dev.gsthero.com'),
  gstin: required('EINV_GSTIN', '05AALFP1139Q003'),
  connectorAuthToken: required(
    'EINV_CONNECTOR_AUTH',
    'testerpclient:20180519134451:05AALFP1139Q003'
  ),
  basicAuthHeader: required('EINV_BASIC_AUTH'),
  clientId: required('EINV_CLIENT_ID', 'testerpclient'),
  clientSecret: required('EINV_CLIENT_SECRET'),
  oauthUsername: required('EINV_OAUTH_USER'),
  oauthPassword: required('EINV_OAUTH_PASS'),
  oauthScope: 'einvauth',
  authUsername: required('EINV_AUTH_USER'),
  authPassword: required('EINV_AUTH_PASS'),
};
```

- [ ] **Step 2: Copy API source and testdata unchanged**

PowerShell from repo root:

```powershell
New-Item -ItemType Directory -Force -Path api/pages, api/utils, api/tests, api/testdata/payloads | Out-Null
Copy-Item playwrighteinvoice/pages/AuthApiPage.ts api/pages/
Copy-Item playwrighteinvoice/pages/EInvoiceApiPage.ts api/pages/
Copy-Item playwrighteinvoice/utils/helpers.ts api/utils/
Copy-Item playwrighteinvoice/utils/payload.builder.ts api/utils/
Copy-Item playwrighteinvoice/utils/scenario.loader.ts api/utils/
Copy-Item playwrighteinvoice/testdata/scenarios.json api/testdata/
Copy-Item playwrighteinvoice/testdata/payloads/*.json api/testdata/payloads/
Copy-Item playwrighteinvoice/tests/E-Invoice_India_all_api_submit.spec.ts api/tests/
if (Test-Path playwrighteinvoice/.env) { Copy-Item playwrighteinvoice/.env api/.env }
```

- [ ] **Step 3: Install and list tests (independence check)**

```powershell
cd api
npm install
npx playwright test --list --project=chromium
```

Expected: only tests from `E-Invoice_India_all_api_submit.spec.ts` (one line per scenario in `scenarios.json`). No Template 1 titles. No `has title` / Playwright sample tests.

```powershell
Select-String -Path api/**/*.ts -Pattern "LoginPage|EInvoiceTemplatePage|excel.template" -SimpleMatch
```

Expected: no matches.

- [ ] **Step 4: Commit**

```powershell
git add api
git commit -m "Add independent api Playwright package for Generate IRN tests."
```

If git is not initialized yet, skip commit until Task 4 (`git init`).

---

### Task 2: Create `template/` Playwright package

**Files:**
- Create: `template/package.json`
- Create: `template/tsconfig.json`
- Create: `template/playwright.config.ts`
- Create: `template/.env.example`
- Create: `template/config/eInvoice.config.ts`
- Create: `template/utils/helpers.ts` (only `todayDocDate` — `excel.template.ts` imports it)
- Copy unchanged from `playwrighteinvoice/`:
  - `pages/LoginPage.ts` → `template/pages/LoginPage.ts`
  - `pages/BusinessDashboardPage.ts` → `template/pages/BusinessDashboardPage.ts`
  - `pages/EInvoiceTemplatePage.ts` → `template/pages/EInvoiceTemplatePage.ts`
  - `utils/excel.template.ts` → `template/utils/excel.template.ts`
  - `tests/E-Invoice_India_template_1.spec.ts` → `template/tests/E-Invoice_India_template_1.spec.ts`

**Interfaces:**
- Consumes: existing UI POM + `prepareUniqueTemplate`
- Produces: `cd template && npm test` lists only Template 1 tests; `eInvoiceConfig` has UI fields only

- [ ] **Step 1: Write package files**

`template/package.json`:

```json
{
  "name": "gsthero-einvoice-template",
  "version": "1.0.0",
  "description": "GST Hero E-Invoice India Excel template UI tests",
  "scripts": {
    "test": "playwright test --project=chromium --workers=1"
  },
  "license": "ISC",
  "type": "commonjs",
  "devDependencies": {
    "@playwright/test": "^1.62.1",
    "@types/node": "^26.2.0"
  },
  "dependencies": {
    "dotenv": "^17.4.2",
    "xlsx": "^0.18.5"
  }
}
```

`template/tsconfig.json` — same as `api/tsconfig.json`.

`template/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/daily-results.json' }],
  ],
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

`template/.env.example`:

```
EINV_BASE_URL=https://dev.gsthero.com
EINV_GSTIN=05AALFP1139Q003
EINV_UI_LOGIN_URL=https://dev.gsthero.com/GspModel/login
EINV_UI_EMAIL=REPLACE_ME
EINV_UI_PASSWORD=REPLACE_ME
EINV_TEMPLATE_CONNECTOR=102
# EINV_TEMPLATE_FILE=testdata/templates/TestFile-27_INVALID_20230904165850.xlsx
```

`template/config/eInvoice.config.ts`:

```typescript
import path from 'path';

function required(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export const eInvoiceConfig = {
  baseUrl: required('EINV_BASE_URL', 'https://dev.gsthero.com'),
  gstin: required('EINV_GSTIN', '05AALFP1139Q003'),
  uiLoginUrl: required('EINV_UI_LOGIN_URL', 'https://dev.gsthero.com/GspModel/login'),
  uiEmail: required('EINV_UI_EMAIL', required('EINV_OAUTH_USER')),
  uiPassword: required('EINV_UI_PASSWORD', required('EINV_OAUTH_PASS')),
  templateConnectorCode: required('EINV_TEMPLATE_CONNECTOR', '102'),
  templateFilePath: required(
    'EINV_TEMPLATE_FILE',
    path.resolve(
      __dirname,
      '../testdata/templates/TestFile-27_INVALID_20230904165850.xlsx'
    )
  ),
};
```

`template/utils/helpers.ts`:

```typescript
export function todayDocDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
```

- [ ] **Step 2: Copy Template source unchanged**

```powershell
New-Item -ItemType Directory -Force -Path template/pages, template/utils, template/tests, template/testdata/templates | Out-Null
Copy-Item playwrighteinvoice/pages/LoginPage.ts template/pages/
Copy-Item playwrighteinvoice/pages/BusinessDashboardPage.ts template/pages/
Copy-Item playwrighteinvoice/pages/EInvoiceTemplatePage.ts template/pages/
Copy-Item playwrighteinvoice/utils/excel.template.ts template/utils/
Copy-Item playwrighteinvoice/tests/E-Invoice_India_template_1.spec.ts template/tests/
if (Test-Path playwrighteinvoice/.env) { Copy-Item playwrighteinvoice/.env template/.env }
```

Do not copy Excel files into git. If a local xlsx exists under `playwrighteinvoice/testdata/templates/`, copy it into `template/testdata/templates/` for local runs only.

- [ ] **Step 3: Install and list tests (independence check)**

```powershell
cd template
npm install
npx playwright test --list --project=chromium
```

Expected: only titles from `E-Invoice_India_template_1.spec.ts` (Map, Upload, Submit, Download PDF, End-to-end).

```powershell
Get-ChildItem -Recurse template -Include *.ts,*.json | Select-String -Pattern "AuthApiPage|EInvoiceApiPage|scenarios.json|payloads/"
```

Expected: no matches. `testdata/payloads/` must not exist under `template/`.

- [ ] **Step 4: Commit** (or defer to Task 4 if no git yet)

```powershell
git add template
git commit -m "Add independent template Playwright package for Excel UI flow."
```

---

### Task 3: Root README, gitignore, and Bitbucket Pipelines

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `bitbucket-pipelines.yml`

**Interfaces:**
- Consumes: `api/package.json` and `template/package.json` scripts named `test`
- Produces: default pipeline installs both; custom `api` / `template` run `npm test` in isolation

- [ ] **Step 1: Write `.gitignore`**

Merge Bitbucket’s initial ignore list with Playwright ignores:

```
node_modules/
dist/
*.class
*.py[cod]
*.log
*.jar
target/
.idea/
TEST*.xml
.DS_Store
Thumbs.db
*.app
*.exe
*.war
*.mp4
*.tiff
*.avi
*.flv
*.mov
*.wmv

.env
test-results/
playwright-report/
blob-report/
playwright/.cache/
playwright/.auth/
logs/
.cursor/
*.xlsx
```

- [ ] **Step 2: Write `README.md`**

Include: clone URL, `cd api` vs `cd template` setup, copy `.env.example` → `.env`, `npm test` in each folder, Bitbucket repository variables (API list and Template list from spec), how to run custom pipelines `api` and `template` from Pipelines → Run pipeline. State that push to `main` only installs; it does not call GST Hero.

- [ ] **Step 3: Write `bitbucket-pipelines.yml`**

```yaml
image: mcr.microsoft.com/playwright:v1.62.1-jammy

definitions:
  caches:
    npm-api: api/node_modules
    npm-template: template/node_modules

pipelines:
  default:
    - step:
        name: Install api and template (no GST Hero calls)
        caches:
          - npm-api
          - npm-template
        script:
          - cd api && npm ci && cd ..
          - cd template && npm ci && cd ..

  custom:
    api:
      - step:
          name: Run API Generate IRN suite
          caches:
            - npm-api
          script:
            - cd api
            - npm ci
            - npx playwright install --with-deps chromium
            - npm test
          artifacts:
            - api/playwright-report/**
            - api/test-results/**
    template:
      - step:
          name: Run Template UI suite
          caches:
            - npm-template
          script:
            - cd template
            - npm ci
            - npx playwright install --with-deps chromium
            - npm test
          artifacts:
            - template/playwright-report/**
            - template/test-results/**
```

Note: Bitbucket artifacts are relative to repo root; after `cd api`, reports still land in `api/playwright-report/`. Keep artifact paths as `api/playwright-report/**`.

- [ ] **Step 4: Verify YAML and README mention two separate custom pipelines**

```powershell
Select-String -Path bitbucket-pipelines.yml -Pattern "custom:|name: Run API|name: Run Template"
```

Expected: `custom:` plus both step names. Default step must not contain `npm test`.

---

### Task 4: Remove mixed tree, init git, push to Bitbucket

**Files:**
- Delete: `playwrighteinvoice/` (after `api/` and `template/` list-tests pass)
- Keep: `docs/superpowers/specs/2026-08-20-split-api-template-bitbucket-design.md`
- Keep: `docs/superpowers/plans/2026-08-20-split-api-template-bitbucket.md`

**Interfaces:**
- Consumes: Tasks 1–3 packages
- Produces: single source of truth on `origin/main`

- [ ] **Step 1: Confirm independence one more time**

```powershell
# from repo root
npx --prefix api playwright test --list --project=chromium
npx --prefix template playwright test --list --project=chromium
```

Expected: API list has only Submit scenarios; Template list has only Template 1 tests.

- [ ] **Step 2: Remove mixed `playwrighteinvoice/` source**

Do not delete until Step 1 passes. Then remove the old tree (including its `node_modules`). Local `.env` already copied into `api/.env` and `template/.env`.

```powershell
Remove-Item -Recurse -Force playwrighteinvoice
```

- [ ] **Step 3: git init, first commit, pull remote, push**

```powershell
git init
git checkout -b main
git remote add origin https://bitbucket.org/perennialsys/gsthero-automation-playwright.git
git add api template bitbucket-pipelines.yml README.md .gitignore docs
git status
```

Confirm `.env` is not staged. Then:

```powershell
git commit -m "Split Playwright into independent api and template packages so each suite can run and pipeline separately."
git pull --rebase origin main
git push -u origin main
```

If `.gitignore` conflicts on rebase: keep the merged ignore list from Step 1 of Task 3, then `git add .gitignore` and `git rebase --continue`.

Do not use `--force`.

- [ ] **Step 4: Verify remote**

```powershell
git status
git log -3 --oneline
git ls-remote origin HEAD
```

Expected: `main` tracks `origin/main`, working tree clean, remote HEAD matches local commit.

---

## Self-review (spec coverage)

| Spec item | Task |
|---|---|
| `api/` package + API-only config | Task 1 |
| `template/` package + UI-only config | Task 2 |
| Independence greps / test --list | Tasks 1–2, 4 |
| Root README, gitignore, pipelines | Task 3 |
| Custom pipelines not combined | Task 3 YAML |
| Drop GitHub Actions, daily-run, example.spec, ERP spec | Task 1–2 omit them; Task 4 deletes old tree |
| No secrets in git | Task 3 gitignore + Task 4 `git status` |
| Push to Bitbucket `main` without history rewrite | Task 4 |
