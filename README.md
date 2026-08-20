# GST Hero E-Invoice Playwright Automation

Playwright suites for GST Hero E-Invoice (India). API Generate IRN tests and Excel Template UI tests live in **separate packages** so they install, run, and pipeline independently.

Repo: https://bitbucket.org/perennialsys/gsthero-automation-playwright

```
api/          Generate IRN HTTP tests
template/     Excel map → upload → submit → PDF (portal UI)
```

## Setup

```bash
git clone https://bitbucket.org/perennialsys/gsthero-automation-playwright.git
cd gsthero-automation-playwright
```

### API suite

```bash
cd api
npm install
npx playwright install chromium
copy .env.example .env   # Windows
# fill API credentials in .env
npm test
```

### Template suite

```bash
cd template
npm install
npx playwright install chromium
copy .env.example .env   # Windows
# fill UI credentials in .env
# place the Excel file locally (not committed); set EINV_TEMPLATE_FILE if needed
npm test
```

Never commit `.env`. Each folder has its own `.env`.

## Bitbucket Pipelines

Push to `main` runs the **default** pipeline only: `npm ci` in `api/` and `template/`. It does **not** call GST Hero.

To run tests, open **Pipelines → Run pipeline** and choose a custom pipeline:

| Pipeline | What it runs |
|---|---|
| `api` | `cd api && npm ci && npx playwright install --with-deps chromium && npm test` |
| `template` | `cd template && npm ci && npx playwright install --with-deps chromium && npm test` |

Schedules (for example daily 10:00 AM IST) can be added in Bitbucket on each custom pipeline separately.

### Repository variables

Repo → **Repository settings** → **Pipelines** → **Repository variables**. Mark passwords and tokens as secured.

**API pipeline**

| Variable | Example |
|---|---|
| `EINV_BASE_URL` | `https://dev.gsthero.com` |
| `EINV_GSTIN` | your GSTIN |
| `EINV_CONNECTOR_AUTH` | connector auth token |
| `EINV_BASIC_AUTH` | `Basic ...` |
| `EINV_CLIENT_ID` | client id |
| `EINV_CLIENT_SECRET` | client secret |
| `EINV_OAUTH_USER` | oauth username |
| `EINV_OAUTH_PASS` | oauth password |
| `EINV_AUTH_USER` | auth username |
| `EINV_AUTH_PASS` | auth password |

**Template pipeline**

| Variable | Example |
|---|---|
| `EINV_BASE_URL` | `https://dev.gsthero.com` |
| `EINV_GSTIN` | your GSTIN |
| `EINV_UI_LOGIN_URL` | `https://dev.gsthero.com/GspModel/login` |
| `EINV_UI_EMAIL` | portal email |
| `EINV_UI_PASSWORD` | portal password |
| `EINV_TEMPLATE_CONNECTOR` | `102` (Excel Version 1.0) |
| `EINV_TEMPLATE_FILE` | path to Excel on the runner (optional) |

If the Excel file is missing, Template tests skip (same as local). Reports are stored as pipeline artifacts (`playwright-report/` and `test-results/` under each package).
