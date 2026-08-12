const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
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
  console.log(result.stdout || '');
  if (result.stderr) console.error(result.stderr);

  return result.status ?? 1;
}

ensureDirs();
process.exit(runTests());
