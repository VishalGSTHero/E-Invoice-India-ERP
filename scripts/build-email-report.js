const fs = require('fs');
const path = require('path');

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name === 'daily-results.json') acc.push(full);
  }
  return acc;
}

function statsFromFile(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const s = json.stats || {};
  return {
    passed: s.expected || 0,
    failed: s.unexpected || 0,
    skipped: s.skipped || 0,
    flaky: s.flaky || 0,
  };
}

function add(a, b) {
  return {
    passed: a.passed + b.passed,
    failed: a.failed + b.failed,
    skipped: a.skipped + b.skipped,
    flaky: a.flaky + b.flaky,
  };
}

function totals(s) {
  const total = s.passed + s.failed + s.skipped + s.flaky;
  return { ...s, total, overall: s.failed > 0 ? 'failed' : 'passed' };
}

function table(title, s) {
  const t = totals(s);
  return `
<h2 style="font-family:Arial,sans-serif;margin:16px 0 8px;">${title}</h2>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;">
  <tr style="background:#e8e8e8;">
    <th align="left">Metric</th>
    <th align="left">Count</th>
  </tr>
  <tr><td>Passed</td><td style="color:#1a7f37;font-weight:700;">${t.passed}</td></tr>
  <tr><td>Failed</td><td style="color:#d1242f;font-weight:700;">${t.failed}</td></tr>
  <tr><td>Skipped</td><td>${t.skipped}</td></tr>
  <tr><td>Flaky</td><td style="color:#9a6700;font-weight:700;">${t.flaky}</td></tr>
  <tr><td>Total</td><td>${t.total}</td></tr>
  <tr><td>Overall</td><td>${t.overall}</td></tr>
</table>`;
}

const root = process.env.REPORT_ROOT || path.join(process.cwd(), 'artifacts');
const files = walk(root);
let combined = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
let api = { passed: 0, failed: 0, skipped: 0, flaky: 0 };
let template = { passed: 0, failed: 0, skipped: 0, flaky: 0 };

for (const file of files) {
  const s = statsFromFile(file);
  combined = add(combined, s);
  if (/api/i.test(file)) api = add(api, s);
  if (/template/i.test(file)) template = add(template, s);
}

const runUrl = process.env.RUN_URL || '';
const html = `<html><body style="color:#111;">
${table('Test Results', combined)}
${table('ERP API (QA)', api)}
${table('Template UI (dev)', template)}
${runUrl ? `<p style="font-family:Arial,sans-serif;margin-top:16px;"><a href="${runUrl}">Open full report and artifacts on GitHub</a></p>` : ''}
</body></html>`;

const out = process.env.EMAIL_HTML || path.join(process.cwd(), 'report-email.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`Wrote ${out} from ${files.length} Playwright JSON report(s)`);
if (files.length === 0) {
  console.warn('No daily-results.json found under', root);
}
