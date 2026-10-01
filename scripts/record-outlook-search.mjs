/**
 * Opens Playwright Codegen against the saved Outlook Chrome profile so you can
 * click the real on-page Search combobox, type the identity search text, open the mail, and
 * have selectors written to tests/helpers/outlookSearch.recorded.ts
 *
 * Usage:
 *   node scripts/record-outlook-search.mjs
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

const profileDir = path.join(root, 'playwright', '.auth', 'chrome-outlook');
const outFile = path.join(root, 'tests', 'helpers', 'outlookSearch.recorded.ts');
const outlookUrl = 'https://outlook.cloud.microsoft/mail/';

fs.mkdirSync(path.dirname(outFile), { recursive: true });

console.log('Playwright Codegen — Outlook search capture');
console.log(`  Profile: ${profileDir}`);
console.log(`  Output:  ${outFile}`);
console.log('');
console.log('In the Playwright Inspector + Chrome window:');
console.log('  1. Wait for Outlook inbox to load (finish MFA if prompted)');
console.log('  2. Click the Outlook SEARCH BAR (top of mail UI — NOT the address bar)');
console.log('  3. Type the identity search text (e.g. FirstEE)');
console.log('  4. Press Enter');
console.log('  5. Open the matching email');
console.log('  6. Close Codegen when done — selectors are saved automatically');
console.log('');

const child = spawn(
  process.execPath,
  [
    playwrightCli,
    'codegen',
    '--channel=chrome',
    `--user-data-dir=${profileDir}`,
    `--output=${outFile}`,
    '--viewport-size=1400,900',
    '--target=playwright-test',
    outlookUrl,
  ],
  {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env },
  }
);

child.on('exit', (code) => process.exit(code ?? 0));
