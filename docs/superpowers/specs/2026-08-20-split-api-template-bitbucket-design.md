# Split API / Template Playwright suites and push to Bitbucket

Date: 2026-08-20  
Repo: https://bitbucket.org/perennialsys/gsthero-automation-playwright (`main`)  
Source today: `playwrighteinvoice/` (mixed API + Template UI in one Playwright project)

## Goal

Ship GST Hero E-Invoice India automation as **two independently runnable Playwright projects** in **one Bitbucket repo**, then push to `main`. API Generate-IRN tests and Template UI tests must never share a process, `npm test` command, or Bitbucket test job.

## Non-goals

- Two Bitbucket repositories
- A shared npm workspace / `shared/` package (duplicate small config/helpers instead)
- Running tests against production
- Committing `.env`, credentials, Excel templates, reports, or `.cursor/`
- Keeping GitHub Actions
- Recreating the missing `E-Invoice_India_template_ERP.spec.ts` (referenced in current `package.json` but not present)
- Keeping Playwright’s sample `tests/example.spec.ts`

## Architecture

This workspace (`E-Invoice_IND`) becomes the git working tree for the Bitbucket repo. Remote `main` currently has only an initial commit (`.gitignore`). Implementation will:

1. Create `api/` and `template/` as sibling folders, each a complete Playwright package.
2. Add root `bitbucket-pipelines.yml`, `README.md`, and `.gitignore`.
3. Remove or stop using the mixed `playwrighteinvoice/` tree after the split copies are verified (do not leave two sources of truth).
4. Initialize git if needed, commit the split (no secrets), pull Bitbucket `main`, push.

```
E-Invoice_IND/
  api/
  template/
  bitbucket-pipelines.yml
  README.md
  .gitignore
  docs/                          # design/plan docs only
```

Each suite has its own `package.json`, `playwright.config.ts`, `tsconfig.json`, `.env.example`, `config/`, `pages/`, `tests/`, and `utils/`.

**Independence rule:** `cd api && npm test` must not load Template pages, UI env vars (except unused leftovers), or Excel files. `cd template && npm test` must not load API payloads, Auth/EInvoice API pages, or Generate IRN scenarios.

## Components

### `api/` — Generate IRN HTTP tests

Move and keep behavior of:

| From `playwrighteinvoice/` | To `api/` |
|---|---|
| `tests/E-Invoice_India_all_api_submit.spec.ts` | `tests/E-Invoice_India_all_api_submit.spec.ts` |
| `pages/AuthApiPage.ts` | `pages/AuthApiPage.ts` |
| `pages/EInvoiceApiPage.ts` | `pages/EInvoiceApiPage.ts` |
| `utils/helpers.ts` | `utils/helpers.ts` |
| `utils/payload.builder.ts` | `utils/payload.builder.ts` |
| `utils/scenario.loader.ts` | `utils/scenario.loader.ts` |
| `testdata/scenarios.json` | `testdata/scenarios.json` |
| `testdata/payloads/*.json` | `testdata/payloads/*.json` |
| API fields from `config/eInvoice.config.ts` | `config/eInvoice.config.ts` (API-only) |
| API keys from `.env.example` | `.env.example` |

`package.json` scripts:

- `test` → `playwright test --project=chromium --workers=1`
- No Template scripts.

`playwright.config.ts`: `testDir: './tests'`, chromium only (drop firefox/webkit; current CI already uses chromium). Load `.env` from `api/.env`.

API config env vars (required for a real run):  
`EINV_BASE_URL`, `EINV_GSTIN`, `EINV_CONNECTOR_AUTH`, `EINV_BASIC_AUTH`, `EINV_CLIENT_ID`, `EINV_CLIENT_SECRET`, `EINV_OAUTH_USER`, `EINV_OAUTH_PASS`, `EINV_AUTH_USER`, `EINV_AUTH_PASS`.

Auth flow stays: OAuth token1 → Authenticate token2 → Generate IRN submit. Spec still authenticates once in `beforeAll` and runs every scenario from `scenarios.json`.

### `template/` — Excel map / upload / submit / PDF UI tests

Move and keep behavior of:

| From `playwrighteinvoice/` | To `template/` |
|---|---|
| `tests/E-Invoice_India_template_1.spec.ts` | `tests/E-Invoice_India_template_1.spec.ts` |
| `pages/LoginPage.ts` | `pages/LoginPage.ts` |
| `pages/BusinessDashboardPage.ts` | `pages/BusinessDashboardPage.ts` |
| `pages/EInvoiceTemplatePage.ts` | `pages/EInvoiceTemplatePage.ts` |
| `utils/excel.template.ts` | `utils/excel.template.ts` |
| UI fields from `config/eInvoice.config.ts` | `config/eInvoice.config.ts` (UI-only) |
| UI keys from `.env.example` | `.env.example` |

`package.json` scripts:

- `test` → `playwright test --project=chromium --workers=1`
- No API scripts.

`playwright.config.ts`: `testDir: './tests'`, chromium only, `fullyParallel: false` (suite is serial). Load `.env` from `template/.env`. Timeout remains 600s at the describe level.

Template config env vars:  
`EINV_BASE_URL`, `EINV_GSTIN`, `EINV_UI_LOGIN_URL`, `EINV_UI_EMAIL`, `EINV_UI_PASSWORD`, `EINV_TEMPLATE_CONNECTOR`.  
`EINV_TEMPLATE_FILE` is optional; default path is `testdata/templates/...xlsx` relative to `template/`. The xlsx is **not** committed. If the file is missing, existing `test.skip` behavior remains.

### Root files

- **README.md** — clone, `api` vs `template` setup, local commands, Bitbucket variables, how to run each custom pipeline.
- **.gitignore** — merge Bitbucket’s existing ignore list with Playwright ignores: `node_modules/`, `.env`, `test-results/`, `playwright-report/`, `blob-report/`, `playwright/.cache/`, `logs/`, `*.xlsx` under testdata (do not commit templates), `.cursor/`.
- **bitbucket-pipelines.yml** — see Pipelines below.
- Drop `.github/workflows/daily-einvoice.yml` (GitHub Actions not used on Bitbucket).
- Drop `scripts/daily-run.js` (filename in it is already stale; Pipelines replace it).

## Data flow

**API:** `scenarios.json` → load payload JSON → uniquify doc no/date → OAuth → Authenticate → POST `/einvoice/v1.03/invoice` (`GENERATEIRN`) → assert HTTP 200 and generate-success / IRN.

**Template:** login (`GspModel`) → open E-Invoice workspace for GSTIN → map connector `102` (or `EINV_TEMPLATE_CONNECTOR`) → uniquify invoice numbers in a copy of the Excel → upload → submit Ready-to-Generate rows → download PDF under `test-results/downloads/`.

No runtime coupling between the two suites.

## Pipelines

File: `bitbucket-pipelines.yml`  
Image: `mcr.microsoft.com/playwright:v1.62.1-jammy` (matches `@playwright/test` ^1.62.1) so browsers are preinstalled.

Three definitions:

1. **default** (every push to `main`): install both packages (`api` and `template` `npm ci`) and stop. Does **not** hit GST Hero. Confirms the split still installs.
2. **custom: api** — `cd api && npm ci && npx playwright install --with-deps chromium && npm test`. Artifacts: `api/playwright-report/**`, `api/test-results/**`.
3. **custom: template** — same pattern under `template/`. Artifacts: `template/playwright-report/**`, `template/test-results/**`.

Do not chain api then template in one test job. Schedules (daily 10:00 AM IST) are configured in Bitbucket UI on each custom pipeline after push; they are not encoded as a combined job.

Pipeline env: Bitbucket repository variables with the names above. Mark passwords/tokens **secured**. Template CI without an Excel file will skip tests (current skip); that is acceptable until a file is provided on the runner or via a secured file.

## Error handling

- Missing required API env: existing page/helper errors fail the API test (no silent pass).
- Missing UI credentials or missing Excel: Template spec keeps `test.skip` with the current messages.
- Pipeline test steps use `set -e` semantics (Pipelines default): first failing test fails the step; artifacts still upload (`after-script` / artifacts always).
- Retries: 2 on CI (`CI=true`), 0 locally — same as current `playwright.config.ts`.

## Testing / verification before push

1. `cd api && npm install` succeeds; `npx playwright test --list` shows only Generate IRN scenario tests.
2. `cd template && npm install` succeeds; `npx playwright test --list` shows only Template 1 tests.
3. Grep: `api/` must not contain `LoginPage`, `EInvoiceTemplatePage`, or `excel.template`.
4. Grep: `template/` must not contain `AuthApiPage`, `EInvoiceApiPage`, `scenarios.json`, or `payloads/`.
5. `.env` is gitignored and not staged.
6. Git remote is the Bitbucket URL; `git push -u origin main` after rebasing/merging the empty initial commit.

Live GST Hero runs are optional at split time if credentials are not in the environment; listing tests and install checks are the merge gate. A full `npm test` in each folder is required when `.env` is present locally.

## Git / push

- Do not rewrite Bitbucket history.
- First content commit message: split Playwright into independent `api` and `template` packages so each suite can run and pipeline separately.
- Remote: `https://bitbucket.org/perennialsys/gsthero-automation-playwright.git`
- Branch: `main`
- If `git pull --rebase origin main` conflicts only on `.gitignore`, merge the ignore lists and continue.

## Open decisions (locked)

- One repo, two folders — approved.
- Custom pipelines, not a single combined test job — approved.
- No `shared/` package on this change — approved.
- Chromium only in both configs — locked here to match current CI and keep install time down.
