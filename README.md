# E-Invoice India Playwright Automation

Playwright API automation for GST Hero E-Invoice (India) with POM structure and multi-scenario Generate IRN coverage. Daily runs are handled by **GitHub Actions**.

## Setup

```bash
npm install
npx playwright install chromium
copy .env.example .env   # Windows
# fill credentials in .env
```

## Run tests locally

```bash
npm run test:erp          # template ERP flow
npm run test:submit-all   # all Postman submit scenarios
```

## Run on GitHub Actions

Workflow: `.github/workflows/daily-einvoice.yml`

- Runs daily at **10:00 AM IST**
- Can also be started manually from the **Actions** tab
- Report is uploaded as a workflow artifact (`playwright-report`)

### Required GitHub Secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → add:

| Secret | Example |
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

Manual run: Actions → **E-Invoice Daily Automation** → **Run workflow**

GitHub can also email you on workflow failure via:  
**Settings → Notifications → Actions** (watch the repo / enable Actions failure emails).

## Structure

```
config/          # env-based configuration
pages/           # POM API pages (Auth, EInvoice)
tests/           # Playwright specs
testdata/        # Postman-derived payloads per scenario
utils/           # helpers, payload builders, scenario loader
scripts/         # helper scripts
.github/         # GitHub Actions workflows
```

## Notes

- Never commit `.env`
- OAuth token1 → Authenticate token2 → Generate IRN submit
