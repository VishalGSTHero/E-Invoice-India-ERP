# GST Hero E-Invoice Playwright Automation

Playwright suites for GST Hero E-Invoice (India). API Generate IRN tests and Excel Template UI tests live in **separate packages** so they install and run independently.

Repos:
- GitHub: https://github.com/VishalGSTHero/E-Invoice-India-ERP
- Bitbucket: https://bitbucket.org/perennialsys/gsthero-automation-playwright

```
api/          Generate IRN HTTP tests  → https://qa.gsthero.com
template/     Excel map → upload → submit → PDF  → https://dev.gsthero.com
```

## Setup

```bash
git clone https://github.com/VishalGSTHero/E-Invoice-India-ERP.git
cd E-Invoice-India-ERP
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

## Environment variables

**API** (`api/.env`)

| Variable | Example |
|---|---|
| `EINV_BASE_URL` | `https://qa.gsthero.com` |
| `EINV_GSTIN` | your GSTIN |
| `EINV_CONNECTOR_AUTH` | connector auth token |
| `EINV_BASIC_AUTH` | `Basic ...` |
| `EINV_CLIENT_ID` | client id |
| `EINV_CLIENT_SECRET` | client secret |
| `EINV_OAUTH_USER` | oauth username |
| `EINV_OAUTH_PASS` | oauth password |
| `EINV_AUTH_USER` | auth username |
| `EINV_AUTH_PASS` | auth password |

**Template** (`template/.env`)

| Variable | Example |
|---|---|
| `EINV_BASE_URL` | `https://dev.gsthero.com` |
| `EINV_GSTIN` | your GSTIN |
| `EINV_UI_LOGIN_URL` | `https://dev.gsthero.com/GspModel/login` |
| `EINV_UI_EMAIL` | portal email |
| `EINV_UI_PASSWORD` | portal password |
| `EINV_TEMPLATE_CONNECTOR` | `102` (Excel Version 1.0) |
| `EINV_TEMPLATE_FILE` | path to Excel (optional) |

If the Excel file is missing, Template tests skip.
