import * as fs from 'fs';
import * as path from 'path';
import { execSync, spawn } from 'child_process';
import { chromium, BrowserContext, Page } from '@playwright/test';
import { LifecycleState } from '../config/lifecycles';

export type EmailAudience = 'manager' | 'user';

const EVIDENCE_DIR = path.resolve('evidence/emails');
const TEMP_DIR = path.resolve('temp');
const OUTLOOK_PROFILE_DIR = path.resolve('playwright/.auth/chrome-outlook');
const OUTLOOK_LOGIN_MARKER = path.join(OUTLOOK_PROFILE_DIR, '.login-ok');
const OUTLOOK_URL = 'https://outlook.cloud.microsoft/mail/';
const SIGNIN_WAIT_MS = 300_000;
const WINDOW_SCRIPT = path.resolve(__dirname, 'outlookWindow.ps1');

export function emailAudienceForLifecycle(lifecycle?: LifecycleState): EmailAudience | undefined {
  if (lifecycle === 'prehire') return 'manager';
  if (lifecycle === 'active') return 'user';
  return undefined;
}

export function emailEvidenceFileName(stageKey: string, audience: EmailAudience): string {
  const safe = stageKey.replace(/[^\w.-]+/g, '_') || 'unknown';
  return `${safe}_${audience}.png`;
}

export function findDroppedEmailScreenshot(
  stageKey: string,
  audience: EmailAudience,
  identityName?: string
): string | undefined {
  const names = [emailEvidenceFileName(stageKey, audience)];
  if (identityName) {
    const who = identityName.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '');
    names.push(`${who}_${audience}.png`);
  }
  const dirs = [EVIDENCE_DIR, TEMP_DIR, path.join(TEMP_DIR, 'emails')];
  for (const dir of dirs) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) return full;
    }
  }
  return undefined;
}

export function droppedEmailHint(stageKey: string, audience: EmailAudience): string {
  return path.join('evidence', 'emails', emailEvidenceFileName(stageKey, audience));
}

function findChromePath(): string {
  const candidates = [
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.env['PROGRAMFILES(X86)']
      ? path.join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Google Chrome was not found. Install Chrome for Outlook screenshot automation.');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runOutlookWindow(args: string[]): string {
  return execSync(
    `powershell -NoProfile -STA -ExecutionPolicy Bypass -File ${JSON.stringify(WINDOW_SCRIPT)} ${args.join(' ')}`,
    { encoding: 'utf8', timeout: SIGNIN_WAIT_MS + 15_000 }
  ).trim();
}

function killOutlookProfileChrome() {
  const script =
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'chrome.exe' -and $_.CommandLine -like '*chrome-outlook*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
  try {
    execSync(`powershell -NoProfile -Command ${JSON.stringify(script)}`, {
      stdio: 'ignore',
      timeout: 20000,
    });
  } catch {
    // ignore
  }
}

function isOutlookProfileLocked(): boolean {
  return [path.join(OUTLOOK_PROFILE_DIR, 'SingletonLock'), path.join(OUTLOOK_PROFILE_DIR, 'lockfile')].some(
    (p) => {
      try {
        return fs.existsSync(p);
      } catch {
        return false;
      }
    }
  );
}

function spawnOutlookChrome(url: string = OUTLOOK_URL) {
  fs.mkdirSync(OUTLOOK_PROFILE_DIR, { recursive: true });
  spawn(
    findChromePath(),
    [
      `--user-data-dir=${OUTLOOK_PROFILE_DIR}`,
      '--new-window',
      '--no-first-run',
      '--no-default-browser-check',
      url,
    ],
    {
      detached: true,
      stdio: 'ignore',
    }
  ).unref();
}

/** Opens Outlook and waits until the inbox is visible (MFA in that same window). */
export async function signInToOutlook(): Promise<void> {
  killOutlookProfileChrome();
  await sleep(1500);
  spawnOutlookChrome(OUTLOOK_URL);
  console.log('Outlook: opened Chrome. Finish sign-in / MFA in that window if asked.');
  runOutlookWindow(['-Action', 'wait', '-TimeoutSec', String(Math.ceil(SIGNIN_WAIT_MS / 1000))]);
  fs.writeFileSync(OUTLOOK_LOGIN_MARKER, new Date().toISOString(), 'utf8');
  killOutlookProfileChrome();
  await sleep(1500);
}

async function waitForInboxReady(page: Page) {
  await page.getByText('Loading', { exact: true }).waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await page
    .getByRole('combobox', { name: /Search for email, meetings/i })
    .or(page.getByRole('combobox', { name: /Search/i }))
    .or(page.getByText(/^Inbox$/i))
    .first()
    .waitFor({ state: 'visible', timeout: 120_000 });
}

/** Click the Outlook page search combobox only — never Chrome's address / Google box. */
async function searchInOutlookSearchBar(page: Page, query: string) {
  if (!/outlook\.(cloud\.)?microsoft|office\.com|office365\.com/i.test(page.url())) {
    throw new Error(`Not on Outlook web (url=${page.url()}). Refusing to type search.`);
  }

  // Recorded via Playwright Codegen: role=combobox "Search for email, meetings,…"
  const searchBox = page
    .getByRole('combobox', { name: /Search for email, meetings/i })
    .or(page.getByRole('combobox', { name: /Search/i }))
    .first();

  await searchBox.waitFor({ state: 'visible', timeout: 30_000 });
  await searchBox.click({ timeout: 10_000 });
  await sleep(300);

  // fill() targets the combobox DOM — never Ctrl+E / omnibox.
  await searchBox.fill(query);

  const typed = (await searchBox.inputValue().catch(() => '')) || '';
  console.log(`Outlook: search bar value after type = "${typed}"`);
  if (!typed.toLowerCase().includes(query.toLowerCase().slice(0, Math.min(6, query.length)))) {
    await searchBox.fill('');
    await searchBox.pressSequentially(query, { delay: 60 });
  }

  await searchBox.press('Enter');
  console.log(`Outlook: submitted search in Outlook search bar for "${query}"`);

  await page.getByText('Loading', { exact: true }).waitFor({ state: 'hidden', timeout: 60_000 }).catch(() => {});
  await sleep(3000);

  if (/google\.(com|co)|bing\.com|duckduckgo/i.test(page.url())) {
    throw new Error('Search went to the browser/Google instead of Outlook. Aborting.');
  }
}

async function openFirstMatchingMessage(page: Page, query: string) {
  // Prefer SailPoint "No Reply" provisioning mail from recorded flow, then name hits.
  const sailpointMail = page
    .getByLabel(/No Reply Test SailPoint/i)
    .or(page.getByText(/No Reply Test SailPoint/i))
    .first();

  const hitPattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '|New Account Created', 'i');
  const nameHit = page
    .locator('[role="option"], [role="listitem"], [role="row"], [data-convid]')
    .filter({ hasText: hitPattern })
    .or(page.getByText(hitPattern))
    .first();

  const hit = (await sailpointMail.isVisible({ timeout: 15_000 }).catch(() => false))
    ? sailpointMail
    : nameHit;

  if (!(await hit.isVisible({ timeout: 45_000 }).catch(() => false))) {
    const debugPath = path.join('temp', 'outlook-search-failed.png');
    await page.screenshot({ path: debugPath, fullPage: false }).catch(() => {});
    throw new Error(`No Outlook result for "${query}". Debug: ${debugPath}`);
  }

  await hit.click();
  await sleep(2000);

  const empty = page.getByText(/Select an item to read|Nothing is selected/i);
  if (await empty.first().isVisible({ timeout: 2000 }).catch(() => false)) {
    await hit.dblclick().catch(() => hit.click());
    await sleep(2000);
  }
}

async function captureWithPlaywright(opts: {
  identityName: string;
  audience: EmailAudience;
  destPath: string;
  searchText?: string;
}): Promise<string> {
  const search = opts.searchText ?? opts.identityName;
  const dest = path.resolve(opts.destPath);

  if (isOutlookProfileLocked()) {
    killOutlookProfileChrome();
    await sleep(1500);
  }

  console.log(`Outlook: inbox → type "${search}" in Outlook search bar (not the address bar)`);

  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(OUTLOOK_PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1400, height: 900 },
      ignoreDefaultArgs: ['--enable-automation'],
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = context.pages()[0] || (await context.newPage());
    await page.goto(OUTLOOK_URL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await sleep(2500);

    if (/login\.(microsoftonline|live)\.com|sso\.godaddy\.com/i.test(page.url())) {
      throw new Error('OUTLOOK_LOGIN_REQUIRED');
    }
    if (!/outlook\.(cloud\.)?microsoft|office\.com|office365\.com/i.test(page.url())) {
      throw new Error(`Expected Outlook web, got ${page.url()}`);
    }

    await waitForInboxReady(page);
    await searchInOutlookSearchBar(page, search);
    await openFirstMatchingMessage(page, search);

    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await page.screenshot({ path: dest, fullPage: false });
    fs.writeFileSync(OUTLOOK_LOGIN_MARKER, new Date().toISOString(), 'utf8');
    return opts.destPath;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Opens Outlook inbox and searches in the on-page Outlook search bar only.
 * Never uses Ctrl+E / address-bar typing (that searches Google).
 */
export async function captureOutlookProvisioningEmail(opts: {
  identityName: string;
  audience: EmailAudience;
  destPath: string;
  searchText?: string;
}): Promise<string | undefined> {
  try {
    if (!fs.existsSync(OUTLOOK_LOGIN_MARKER)) {
      console.log('Outlook: no saved session yet — sign in once…');
      await signInToOutlook();
    }

    try {
      const captured = await captureWithPlaywright(opts);
      console.log(`Outlook: saved ${opts.audience} provisioning email → ${captured}`);
      return captured;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('OUTLOOK_LOGIN_REQUIRED')) throw err;

      console.log('Outlook: session expired — sign in again, then capture continues…');
      if (fs.existsSync(OUTLOOK_LOGIN_MARKER)) fs.unlinkSync(OUTLOOK_LOGIN_MARKER);
      await signInToOutlook();
      const captured = await captureWithPlaywright(opts);
      console.log(`Outlook: saved ${opts.audience} provisioning email → ${captured}`);
      return captured;
    }
  } catch (err) {
    console.log(`Outlook: could not capture ${opts.audience} email (${(err as Error).message}).`);
    return undefined;
  }
}

export async function captureProvisioningEmail(
  _sailpointPage: Page | undefined,
  opts: {
    identityName: string;
    stageKey: string;
    audience: EmailAudience;
    destPath: string;
    searchText?: string;
  }
): Promise<string | undefined> {
  const fromOutlook = await captureOutlookProvisioningEmail(opts);
  if (fromOutlook) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const kept = path.join(EVIDENCE_DIR, emailEvidenceFileName(opts.stageKey, opts.audience));
    if (path.resolve(fromOutlook) !== path.resolve(kept)) {
      fs.copyFileSync(fromOutlook, kept);
    }
    return fromOutlook;
  }

  const dropped = findDroppedEmailScreenshot(opts.stageKey, opts.audience, opts.identityName);
  if (dropped) {
    fs.mkdirSync(path.dirname(opts.destPath), { recursive: true });
    if (path.resolve(dropped) !== path.resolve(opts.destPath)) {
      fs.copyFileSync(dropped, opts.destPath);
    }
    console.log(`Email: Outlook automation missed; using saved screenshot ${dropped}`);
    return opts.destPath;
  }

  console.log(`Email: no ${opts.audience} screenshot. ${droppedEmailHint(opts.stageKey, opts.audience)}`);
  return undefined;
}
