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
