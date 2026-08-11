# E-Invoice India Playwright Automation

Playwright API automation for GST Hero E-Invoice (India) with POM structure, multi-scenario Generate IRN coverage, and daily email reporting.

## Setup

```bash
npm install
npx playwright install chromium
copy .env.example .env   # Windows
# fill credentials in .env
```

## Run tests

```bash
npm run test:erp          # template ERP flow
npm run test:submit-all   # all Postman submit scenarios
npm run daily             # run all submit tests + email report
```

## Daily schedule (Windows)

Default time: **10:00 AM**

```bash
npm run schedule:daily
```

Requires valid SMTP settings in `.env`.

## Run on GitHub Actions

Workflow: `.github/workflows/daily-einvoice.yml`

- Runs daily at **10:00 AM IST**
- Can also be started manually from the **Actions** tab

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
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | sender email |
| `SMTP_PASS` | Gmail App Password |
| `MAIL_FROM` | sender email |
| `MAIL_TO` | receiver email |

Manual run: Actions → **E-Invoice Daily Automation** → **Run workflow**

## Structure

```
config/          # env-based configuration
pages/           # POM API pages (Auth, EInvoice)
tests/           # Playwright specs
testdata/        # Postman-derived payloads per scenario
utils/           # helpers, payload builders, scenario loader
scripts/         # daily-run, SMTP test, Windows task registration
```

## Notes

- Never commit `.env`
- OAuth token1 → Authenticate token2 → Generate IRN submit
