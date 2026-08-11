const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const nodemailer = require('nodemailer');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT = path.resolve(__dirname, '..');
const RESULTS_JSON = path.join(ROOT, 'test-results', 'daily-results.json');
const LOG_DIR = path.join(ROOT, 'logs');

function ensureDirs() {
  fs.mkdirSync(path.dirname(RESULTS_JSON), { recursive: true });
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function runTests() {
  console.log('Starting daily E-Invoice submit suite...');
  const args = [
    'playwright',
    'test',
    'tests/E-Invoice_India_all_submit.spec.ts',
    '--project=chromium',
    '--workers=1',
    `--reporter=list,json=${RESULTS_JSON}`,
  ];

  const result = spawnSync('npx', args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    env: process.env,
  });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = path.join(LOG_DIR, `daily-run-${stamp}.log`);
  const log = [
    `exitCode: ${result.status}`,
    '----- STDOUT -----',
    result.stdout || '',
    '----- STDERR -----',
    result.stderr || '',
  ].join('\n');
  fs.writeFileSync(logFile, log, 'utf8');
  console.log('Log saved:', logFile);

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    logFile,
  };
}

function parseResults() {
  if (!fs.existsSync(RESULTS_JSON)) {
    return {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 0,
      failures: [],
      suites: [],
    };
  }

  const report = JSON.parse(fs.readFileSync(RESULTS_JSON, 'utf8'));
  const suites = [];
  const failures = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;

  function walk(suite) {
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        const result = (t.results || [])[0] || {};
        durationMs += result.duration || 0;
        const status = result.status || t.status || 'unknown';
        const title = `${suite.title ? suite.title + ' › ' : ''}${spec.title}`;
        suites.push({ title, status, duration: result.duration || 0 });

        if (status === 'passed' || status === 'expected') passed += 1;
        else if (status === 'skipped') skipped += 1;
        else {
          failed += 1;
          failures.push({
            title,
            error: result.error?.message || result.errors?.[0]?.message || status,
          });
        }
      }
    }
    for (const child of suite.suites || []) walk(child);
  }

  for (const suite of report.suites || []) walk(suite);

  return {
    total: passed + failed + skipped,
    passed,
    failed,
    skipped,
    durationMs,
    failures,
    suites,
  };
}

function buildEmailHtml(summary, run) {
  const statusColor = summary.failed > 0 || run.exitCode !== 0 ? '#b91c1c' : '#15803d';
  const statusText = summary.failed > 0 || run.exitCode !== 0 ? 'FAILED' : 'PASSED';
  const durationSec = (summary.durationMs / 1000).toFixed(1);
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const rows = summary.suites
    .map((s) => {
      const color =
        s.status === 'passed' || s.status === 'expected' ? '#15803d' : '#b91c1c';
      return `<tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${escapeHtml(s.title)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${color};font-weight:600;">${escapeHtml(s.status)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${(s.duration / 1000).toFixed(2)}s</td>
      </tr>`;
    })
    .join('');

  const failureBlock =
    summary.failures.length === 0
      ? '<p>No failures.</p>'
      : `<ul>${summary.failures
          .map(
            (f) =>
              `<li><b>${escapeHtml(f.title)}</b><br/><pre style="white-space:pre-wrap;background:#f8f8f8;padding:8px;border-radius:6px;">${escapeHtml(
                f.error
              )}</pre></li>`
          )
          .join('')}</ul>`;

  return `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:800px;margin:0 auto;">
    <h2 style="margin-bottom:4px;">E-Invoice India — Daily Automation Report</h2>
    <p style="margin-top:0;color:#555;">Run at ${escapeHtml(when)} (IST)</p>
    <p style="font-size:20px;font-weight:700;color:${statusColor};">Overall: ${statusText}</p>
    <table style="border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 12px 4px 0;">Total</td><td><b>${summary.total}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;">Passed</td><td style="color:#15803d;"><b>${summary.passed}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;">Failed</td><td style="color:#b91c1c;"><b>${summary.failed}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;">Skipped</td><td><b>${summary.skipped}</b></td></tr>
      <tr><td style="padding:4px 12px 4px 0;">Duration</td><td><b>${durationSec}s</b></td></tr>
    </table>
    <h3>Failures</h3>
    ${failureBlock}
    <h3>All results</h3>
    <table style="border-collapse:collapse;width:100%;">
      <thead>
        <tr style="background:#f3f4f6;text-align:left;">
          <th style="padding:8px 10px;">Test</th>
          <th style="padding:8px 10px;">Status</th>
          <th style="padding:8px 10px;">Duration</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="3" style="padding:8px;">No tests found in report</td></tr>'}</tbody>
    </table>
    <p style="color:#777;font-size:12px;margin-top:24px;">Log: ${escapeHtml(run.logFile)}</p>
  </div>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function sendEmail(summary, run) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM || user;
  const to = process.env.MAIL_TO;

  if (!host || !user || !pass || !to) {
    throw new Error(
      'Missing email config. Set SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_TO in .env'
    );
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const statusText = summary.failed > 0 || run.exitCode !== 0 ? 'FAILED' : 'PASSED';
  const subject =
    process.env.MAIL_SUBJECT ||
    `[E-Invoice Daily] ${statusText} — ${summary.passed}/${summary.total} passed`;

  const info = await transporter.sendMail({
    from,
    to,
    subject,
    html: buildEmailHtml(summary, run),
    text: `E-Invoice daily run ${statusText}. Passed ${summary.passed}/${summary.total}. Failed ${summary.failed}.`,
  });

  console.log('Email sent:', info.messageId);
  return info;
}

async function main() {
  ensureDirs();
  const run = runTests();
  const summary = parseResults();

  console.log(
    `Summary => total=${summary.total} passed=${summary.passed} failed=${summary.failed}`
  );

  try {
    await sendEmail(summary, run);
  } catch (err) {
    console.error('Email send failed:', err.message);
    process.exitCode = 2;
    return;
  }

  process.exitCode = run.exitCode === 0 && summary.failed === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
