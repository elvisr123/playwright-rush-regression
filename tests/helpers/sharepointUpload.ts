import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { chromium, Browser, BrowserContext, Frame, Page } from '@playwright/test';

/** Default AsbRushISC shared folder (team-accessible). Override with SHAREPOINT_FOLDER_URL. */
export const DEFAULT_SHAREPOINT_FOLDER_URL =
  'https://netorgft1314491.sharepoint.com/:f:/s/AsbRushISC/IgCeOlnQ-rKgTZal9vwOVU15AV5osomhr1TFmvzuxfLdkyM?e=hupAcw';

export function sharePointDestinationForSource(sourceName: string): {
  folderUrl: string;
  syncDir: string;
  subfolder: string;
} {
  const name = sourceName.toLowerCase();
  const isCopley = name.includes('copley');
  const isRush = name.includes('rush lawson') || sourceName === 'RUSH Lawson';
  const isNerm =
    name.includes('non-employee') || sourceName === 'Non-Employee Workforce';

  const folderUrl = process.env.SHAREPOINT_FOLDER_URL?.trim() || DEFAULT_SHAREPOINT_FOLDER_URL;
  const syncDir = process.env.SHAREPOINT_SYNC_DIR?.trim() || '';

  if (isCopley) {
    return {
      folderUrl,
      syncDir,
      subfolder: process.env.SHAREPOINT_SUBFOLDER_COPLEY?.trim() || 'Copley',
    };
  }
  if (isRush) {
    return {
      folderUrl,
      syncDir,
      subfolder: process.env.SHAREPOINT_SUBFOLDER_RUSH?.trim() || 'Rush',
    };
  }
  if (isNerm) {
    return {
      folderUrl,
      syncDir,
      subfolder: process.env.SHAREPOINT_SUBFOLDER_NERM?.trim() || 'NERM_testcases',
    };
  }

  return { folderUrl, syncDir, subfolder: '' };
}

/** Separate Chrome profile for SharePoint uploads — does not touch your main Chrome. */
const UPLOAD_PROFILE_DIR = path.resolve('playwright/.auth/chrome-sharepoint');

/** Clean report file name: {TestUser}_{yyyy-MM-dd}_{HH-mm-ss}.docx */
export function buildReportFileName(identityName: string, when: Date = new Date()): string {
  const safeUser =
    identityName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || 'Unknown_Identity';

  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    `_${pad(when.getHours())}-${pad(when.getMinutes())}-${pad(when.getSeconds())}`;

  return `${safeUser}_${stamp}.docx`;
}

export function uniqueReportFileName(fileName: string, attempt: number): string {
  if (attempt <= 0) return fileName;
  const ext = path.extname(fileName);
  const base = fileName.slice(0, -ext.length || undefined);
  return `${base}_${attempt}${ext}`;
}

export function localReportPath(fileName: string): string {
  // Staging path only — the finished report is published to SharePoint, then this file is deleted.
  return path.join('temp', fileName);
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
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
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('Google Chrome was not found.');
}

/** Polls the CDP /json/version endpoint until the remote-debugging port answers. */
async function waitForCdpReady(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port, path: '/json/version', timeout: 1000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`Chrome remote debugging port ${port} never became ready.`);
}

type Root = Page | Frame;

function allRoots(page: Page): Root[] {
  return [page, ...page.frames()];
}

/** SharePoint file inputs are usually hidden — do NOT wait for visible. */
async function tryHiddenFileInputs(root: Root, absoluteFilePath: string): Promise<boolean> {
  const inputs = root.locator('input[type="file"]');
  const count = await inputs.count();
  for (let i = 0; i < count; i++) {
    try {
      await inputs.nth(i).setInputFiles(absoluteFilePath, { timeout: 5000 });
      return true;
    } catch {
      // try next
    }
  }
  return false;
}

async function tryCommandBarUpload(page: Page, root: Root, absoluteFilePath: string): Promise<boolean> {
  // Modern SharePoint (this tenant) uses "+ Create or upload", not a plain "Upload" button.
  const uploadTriggers = [
    root.getByRole('button', { name: /create or upload/i }),
    root.getByRole('button', { name: /^upload( files)?$/i }),
    root.getByRole('menuitem', { name: /^upload( files)?$/i }),
    root.locator('[data-automationid="uploadCommand"]'),
    root.locator('button[name="Upload"], button[aria-label*="Upload" i], button[aria-label*="Create or upload" i]'),
    root.getByRole('button', { name: /add new/i }),
    root.getByRole('button', { name: /^new$/i }),
  ];

  for (const trigger of uploadTriggers) {
    if (!(await trigger.first().isVisible({ timeout: 1500 }).catch(() => false))) continue;

    console.log('SharePoint: clicking create/upload command…');
    const chooserPromise = page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
    await trigger.first().click().catch(() => {});
    await sleep(800);

    // Submenu items after "+ Create or upload"
    const submenu = root
      .getByRole('menuitem', {
        name: /files upload|upload files|files$|from this device|device upload/i,
      })
      .or(root.getByText(/files upload|upload files|from this device/i))
      .first();

    if (await submenu.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('SharePoint: choosing Files upload from menu…');
      const nestedChooser = page.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
      await submenu.click();
      const chooser = (await nestedChooser) || (await chooserPromise);
      if (chooser) {
        await chooser.setFiles(absoluteFilePath);
        return true;
      }
      if (await tryHiddenFileInputs(root, absoluteFilePath)) return true;
    } else {
      const chooser = await chooserPromise;
      if (chooser) {
        await chooser.setFiles(absoluteFilePath);
        return true;
      }
      if (await tryHiddenFileInputs(root, absoluteFilePath)) return true;
    }
  }
  return false;
}

function joinServerRelativeFolder(baseFolder: string, subfolder?: string): string {
  if (!subfolder) return baseFolder;
  return `${baseFolder.replace(/\/+$/, '')}/${subfolder}`;
}

async function listChildFolders(
  context: BrowserContext,
  siteUrl: string,
  parentFolder: string
): Promise<string[]> {
  const listUrl =
    `${siteUrl}/_api/web/GetFolderByServerRelativeUrl(@path)/Folders?$select=Name` +
    `&@path='${parentFolder.replace(/'/g, "''")}'`;
  const res = await context.request.get(listUrl, {
    headers: { Accept: 'application/json;odata=verbose' },
  });
  if (!res.ok()) {
    console.log(`SharePoint REST: could not list folders in ${parentFolder} (${res.status()})`);
    return [];
  }
  const json = (await res.json()) as { d?: { results?: Array<{ Name?: string }> } };
  return (json.d?.results || []).map((row) => row.Name || '').filter(Boolean);
}

function matchExistingSubfolder(childNames: string[], wanted: string): string | undefined {
  const key = wanted.toLowerCase();
  return (
    childNames.find((name) => name.toLowerCase() === key) ||
    childNames.find((name) => name.toLowerCase().includes(key))
  );
}

async function ensureChildFolder(
  context: BrowserContext,
  siteUrl: string,
  parentFolder: string,
  wanted: string,
  digest: string
): Promise<string> {
  const children = await listChildFolders(context, siteUrl, parentFolder);
  console.log(`SharePoint REST: folders in Playwright test cases: ${children.join(', ') || '(none)'}`);
  const existing = matchExistingSubfolder(children, wanted);
  if (existing) {
    console.log(`SharePoint REST: using existing subfolder "${existing}"`);
    return existing;
  }

  const addUrl =
    `${siteUrl}/_api/web/GetFolderByServerRelativeUrl(@path)/Folders/add(url=@name)` +
    `?@path='${parentFolder.replace(/'/g, "''")}'` +
    `&@name='${wanted.replace(/'/g, "''")}'`;
  const addRes = await context.request.post(addUrl, {
    headers: {
      Accept: 'application/json;odata=verbose',
      'X-RequestDigest': digest,
    },
  });
  if (!addRes.ok()) {
    const body = await addRes.text();
    throw new Error(
      `Could not find or create the "${wanted}" folder inside Playwright test cases. Existing folders: ${children.join(', ') || '(none)'}. ${body}`
    );
  }
  console.log(`SharePoint REST: created subfolder "${wanted}"`);
  return wanted;
}

async function uploadViaSharePointRest(
  context: BrowserContext,
  page: Page,
  absoluteFilePath: string,
  remoteFileName: string,
  subfolder?: string
): Promise<boolean | 'exists'> {
  const pageUrl = page.url();
  let parsed: URL;
  try {
    parsed = new URL(pageUrl);
  } catch {
    return false;
  }
  if (!/sharepoint\.com$/i.test(parsed.hostname) && !parsed.hostname.includes('sharepoint.com')) {
    return false;
  }

  const folderId = parsed.searchParams.get('id');
  if (!folderId) {
    console.log('SharePoint REST: no folder id= in URL — skipping REST upload.');
    return false;
  }

  const parentFolder = decodeURIComponent(folderId);
  const siteMatch = parentFolder.match(/^(\/sites\/[^/]+)/i);
  if (!siteMatch) {
    console.log(`SharePoint REST: could not parse site from "${parentFolder}"`);
    return false;
  }
  const siteUrl = `${parsed.origin}${siteMatch[1]}`;

  console.log(`SharePoint REST: site=${siteUrl}`);
  console.log(`SharePoint REST: parent=${parentFolder}`);

  const digestRes = await context.request.post(`${siteUrl}/_api/contextinfo`, {
    headers: { Accept: 'application/json;odata=verbose' },
  });
  if (!digestRes.ok()) {
    console.log(`SharePoint REST: contextinfo failed (${digestRes.status()})`);
    return false;
  }
  const digestJson = (await digestRes.json()) as {
    d?: { GetContextWebInformation?: { FormDigestValue?: string } };
  };
  const digest = digestJson?.d?.GetContextWebInformation?.FormDigestValue;
  if (!digest) {
    console.log('SharePoint REST: no FormDigestValue returned');
    return false;
  }

  let resolvedSubfolder = subfolder;
  if (subfolder) {
    resolvedSubfolder = await ensureChildFolder(context, siteUrl, parentFolder, subfolder, digest);
  }
  const folderServerRelativeUrl = joinServerRelativeFolder(parentFolder, resolvedSubfolder);
  console.log(`SharePoint REST: folder=${folderServerRelativeUrl}`);

  // Never overwrite an existing library file — add only. Caller retries with a
  // unique name if SharePoint reports a collision.
  const addUrl =
    `${siteUrl}/_api/web/GetFolderByServerRelativeUrl(@path)/Files/add(url=@filename,overwrite=false)` +
    `?@path='${folderServerRelativeUrl.replace(/'/g, "''")}'` +
    `&@filename='${remoteFileName.replace(/'/g, "''")}'`;

  const fileBuffer = fs.readFileSync(absoluteFilePath);
  const putRes = await context.request.post(addUrl, {
    headers: {
      Accept: 'application/json;odata=verbose',
      'X-RequestDigest': digest,
    },
    data: fileBuffer,
  });

  if (!putRes.ok()) {
    const body = await putRes.text();
    if (putRes.status() === 409 || /already exists|name already/i.test(body)) {
      console.log(`SharePoint REST: "${remoteFileName}" already exists — will upload under a new name.`);
      return 'exists';
    }
    console.log(`SharePoint REST upload failed (${putRes.status()}): ${body}`);
    return false;
  }

  console.log(`SharePoint REST: uploaded "${remoteFileName}" successfully.`);
  return true;
}

async function uploadViaSharePointUi(page: Page, absoluteFilePath: string, fileName: string) {
  console.log(`SharePoint: automatically uploading "${fileName}"…`);
  console.log(`SharePoint: current URL = ${page.url()}`);

  // Give the Fluent command bar time to hydrate
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(2500);

  let uploaded = false;

  for (const root of allRoots(page)) {
    if (await tryHiddenFileInputs(root, absoluteFilePath)) {
      uploaded = true;
      break;
    }
  }

  if (!uploaded) {
    for (const root of allRoots(page)) {
      if (await tryCommandBarUpload(page, root, absoluteFilePath)) {
        uploaded = true;
        break;
      }
    }
  }

  // One more pass — clicking Upload often injects a new hidden input
  if (!uploaded) {
    await sleep(1000);
    for (const root of allRoots(page)) {
      if (await tryHiddenFileInputs(root, absoluteFilePath)) {
        uploaded = true;
        break;
      }
    }
  }

  if (!uploaded) {
    const debugPath = path.join('temp', 'sharepoint-upload-failed.png');
    fs.mkdirSync('temp', { recursive: true });
    await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {});
    throw new Error(
      `Could not find SharePoint Upload controls on ${page.url()}. Debug screenshot: ${debugPath}`
    );
  }

  // If SharePoint asks to replace an existing file, keep both — never overwrite.
  for (const root of allRoots(page)) {
    const keepBoth = root.getByRole('button', { name: /keep both|keep all|don't replace|do not replace/i }).first();
    if (await keepBoth.isVisible({ timeout: 3000 }).catch(() => false)) {
      await keepBoth.click();
      break;
    }
  }

  // Confirm the file landed in the library
  let seen = false;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    for (const root of allRoots(page)) {
      if (await root.getByText(fileName, { exact: false }).first().isVisible().catch(() => false)) {
        seen = true;
        break;
      }
    }
    if (seen) break;
    await sleep(2000);
  }
  if (!seen) {
    throw new Error(
      `Upload may have been sent, but "${fileName}" did not appear in the SharePoint folder within 3 minutes.`
    );
  }
  console.log(`SharePoint: confirmed "${fileName}" is in the folder.`);
}

async function openSourceSubfolder(page: Page, subfolder: string): Promise<void> {
  const escaped = subfolder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = page.getByRole('link', { name: new RegExp(`^${escaped}$`, 'i') }).first();
  const fuzzy = page.getByRole('link', { name: new RegExp(escaped, 'i') }).first();
  const folder = (await exact.isVisible({ timeout: 4000 }).catch(() => false)) ? exact : fuzzy;
  if (!(await folder.isVisible({ timeout: 8000 }).catch(() => false))) {
    throw new Error(`Could not find the "${subfolder}" folder inside Playwright test cases.`);
  }
  await folder.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(2000);
  console.log(`SharePoint: opened subfolder "${subfolder}"`);
}

/** Opens the folder with the saved session and uploads the file — fully automatic. */
const LOGIN_URL_PATTERN = /login\.(microsoftonline|live)\.com|sso\.godaddy\.com/i;
const SHAREPOINT_URL_PATTERN = /sharepoint\.com/i;
const HTTPS_URL_RE = /https?:\/\/[^\s\x00-\x1f"'<>\\]{8,400}/g;
const SHAREPOINT_AUTH_MARKERS = ['FedAuth', 'rtFa', 'SPOIDCRL'];

/**
 * GoDaddy SSO treats Playwright Chromium (`--no-sandbox`, `--enable-automation`,
 * an attached CDP session) as "a bit unusual". Sign-in therefore happens in a
 * stock Google Chrome window with no debugging or sandbox flags. Playwright
 * attaches only after the SharePoint cookies are already on disk.
 */
const CLEAN_CHROME_ARGS = [
  '--new-window',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-popup-blocking',
  '--hide-crash-restore-bubble',
];

function launchChrome(args: string[]): ChildProcess {
  const child = spawn(findChromePath(), args, { detached: true, stdio: 'ignore' });
  child.unref();
  return child;
}

function pidsUsingProfile(profileDir: string): number[] {
  try {
    if (process.platform === 'win32') {
      const escaped = profileDir.replace(/'/g, "''");
      const out = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${escaped}*' } | Select-Object -ExpandProperty ProcessId"`,
        { encoding: 'utf8', timeout: 8000 }
      );
      return out
        .split(/\s+/)
        .map(Number)
        .filter((n) => n > 0);
    }
    const out = execSync('ps -ax -o pid= -o command=', { encoding: 'utf8', timeout: 8000 });
    return out
      .split('\n')
      .filter((line) => line.includes(`--user-data-dir=${profileDir}`))
      .map((line) => Number(line.trim().split(/\s+/)[0]))
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopChromeUsingProfile(profileDir: string): Promise<void> {
  const pids = pidsUsingProfile(profileDir);
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }

  const lockPath = path.join(profileDir, 'SingletonLock');
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const remaining = pidsUsingProfile(profileDir).filter(isPidAlive);
    if (remaining.length === 0 && !fs.existsSync(lockPath)) return;
    await sleep(300);
  }

  for (const pid of pidsUsingProfile(profileDir)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  await sleep(500);
}

function extractUrlsFromBuffer(buf: Buffer): string[] {
  const found = new Set<string>();
  for (const encoding of ['utf8', 'utf16le'] as const) {
    const text = buf.toString(encoding);
    for (const match of text.match(HTTPS_URL_RE) ?? []) found.add(match);
  }
  return [...found];
}

function readFilesSafely(filePaths: string[]): Buffer[] {
  const buffers: Buffer[] = [];
  for (const filePath of filePaths) {
    try {
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
      if (fs.statSync(filePath).size > 20 * 1024 * 1024) continue;
      buffers.push(fs.readFileSync(filePath));
    } catch {
      // file may be mid-write
    }
  }
  return buffers;
}

function newestSessionFile(profileDir: string): string | undefined {
  const files = listFilesRecursive(path.join(profileDir, 'Default', 'Sessions'));
  let best: { file: string; mtime: number } | undefined;
  for (const file of files) {
    try {
      const mtime = fs.statSync(file).mtimeMs;
      if (!best || mtime > best.mtime) best = { file, mtime };
    } catch {
      // ignore
    }
  }
  return best?.file;
}

function listFilesRecursive(dir: string, depth = 0): string[] {
  if (depth > 2 || !fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return listFilesRecursive(full, depth + 1);
      return [full];
    });
  } catch {
    return [];
  }
}

function profileSessionUrls(profileDir: string): string[] {
  const sessionDir = path.join(profileDir, 'Default', 'Sessions');
  const files = [
    ...listFilesRecursive(sessionDir),
    path.join(profileDir, 'Default', 'Current Session'),
    path.join(profileDir, 'Default', 'Current Tabs'),
    path.join(profileDir, 'Default', 'Last Session'),
    path.join(profileDir, 'Default', 'Last Tabs'),
  ];
  return readFilesSafely(files).flatMap(extractUrlsFromBuffer);
}

function profileHasSharePointAuthCookie(profileDir: string): boolean {
  const files = [
    path.join(profileDir, 'Default', 'Network', 'Cookies'),
    path.join(profileDir, 'Default', 'Network', 'Cookies-wal'),
    path.join(profileDir, 'Default', 'Cookies'),
    path.join(profileDir, 'Default', 'Cookies-wal'),
  ];
  for (const buf of readFilesSafely(files)) {
    if (!buf.includes(Buffer.from('sharepoint.com'))) continue;
    if (SHAREPOINT_AUTH_MARKERS.some((marker) => buf.includes(Buffer.from(marker)))) return true;
  }
  return false;
}

function profileLooksSignedIntoSharePoint(profileDir: string): boolean {
  if (profileHasSharePointAuthCookie(profileDir)) return true;
  const newest = newestSessionFile(profileDir);
  const urls = newest ? readFilesSafely([newest]).flatMap(extractUrlsFromBuffer) : [];
  const onSharePoint = urls.some((url) => SHAREPOINT_URL_PATTERN.test(url) && !LOGIN_URL_PATTERN.test(url));
  const onLogin = urls.some((url) => LOGIN_URL_PATTERN.test(url));
  return onSharePoint && !onLogin;
}

async function readCdpPageUrl(cdpPort: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: cdpPort, path: '/json/list', timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const targets = JSON.parse(body) as Array<{ type: string; url: string }>;
          resolve(targets.find((t) => t.type === 'page')?.url);
        } catch {
          resolve(undefined);
        }
      });
    });
    req.on('error', () => resolve(undefined));
    req.on('timeout', () => {
      req.destroy();
      resolve(undefined);
    });
  });
}

async function waitForHumanSharePointLogin(profileDir: string, timeoutMs = 600_000): Promise<void> {
  console.log('\n========== ONE-TIME SHAREPOINT SIGN-IN ==========');
  console.log('A normal Chrome window just opened (no automation flags).');
  console.log('1) Sign in with your work account');
  console.log('2) If GoDaddy says "Your browser is a bit unusual", click Let\'s try again');
  console.log('   and disconnect any VPN, then retry');
  console.log('3) Once you see the SharePoint folder, leave the window open');
  console.log('   → The test detects this automatically, then uploads the Word file');
  console.log('=================================================\n');

  let warnedAboutGodaddy = false;
  let readyStreak = 0;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const urls = profileSessionUrls(profileDir);
    if (!warnedAboutGodaddy && urls.some((url) => /sso\.godaddy\.com/i.test(url))) {
      warnedAboutGodaddy = true;
      console.log(
        'SharePoint: GoDaddy sign-in page is open. Complete it in that Chrome window. If it blocks you, click Let\'s try again and turn off VPN.'
      );
    }
    if (profileLooksSignedIntoSharePoint(profileDir)) {
      readyStreak += 1;
      if (readyStreak >= 3) {
        console.log('SharePoint: signed in. Saving the session and starting the upload…');
        return;
      }
    } else {
      readyStreak = 0;
    }
    await sleep(1000);
  }

  throw new Error('Timed out waiting for SharePoint sign-in to complete in the browser window.');
}

async function waitForCdpAwayFromLogin(cdpPort: number, timeoutMs = 45_000): Promise<boolean> {
  const start = Date.now();
  let loginSeenAt: number | undefined;
  while (Date.now() - start < timeoutMs) {
    const url = await readCdpPageUrl(cdpPort);
    if (url && SHAREPOINT_URL_PATTERN.test(url) && !LOGIN_URL_PATTERN.test(url)) return true;
    if (url && LOGIN_URL_PATTERN.test(url)) {
      loginSeenAt = loginSeenAt ?? Date.now();
      // Silent SSO can sit on Microsoft/GoDaddy for a few seconds. The
      // "unusual browser" interstitial stays put — treat 12s as stuck.
      if (Date.now() - loginSeenAt >= 12_000) return false;
    } else {
      loginSeenAt = undefined;
    }
    await sleep(500);
  }
  const url = await readCdpPageUrl(cdpPort);
  return Boolean(url && SHAREPOINT_URL_PATTERN.test(url) && !LOGIN_URL_PATTERN.test(url));
}

async function ensureInteractiveSharePointLogin(folderUrl: string): Promise<void> {
  await stopChromeUsingProfile(UPLOAD_PROFILE_DIR);
  console.log('SharePoint: opening a normal Chrome window for sign-in…');
  launchChrome([`--user-data-dir=${UPLOAD_PROFILE_DIR}`, ...CLEAN_CHROME_ARGS, folderUrl]);
  await waitForHumanSharePointLogin(UPLOAD_PROFILE_DIR);
  await stopChromeUsingProfile(UPLOAD_PROFILE_DIR);
}

async function uploadAutomatically(
  folderUrl: string,
  absoluteFilePath: string,
  remoteFileName: string,
  subfolder?: string
): Promise<void> {
  fs.mkdirSync(UPLOAD_PROFILE_DIR, { recursive: true });
  const cdpPort = 9878;

  console.log('SharePoint: opening upload session…');
  await stopChromeUsingProfile(UPLOAD_PROFILE_DIR);

  if (!profileLooksSignedIntoSharePoint(UPLOAD_PROFILE_DIR)) {
    await ensureInteractiveSharePointLogin(folderUrl);
  } else {
    console.log('SharePoint: reusing the saved Chrome sign-in.');
  }

  const startUploadChrome = () =>
    launchChrome([
      `--user-data-dir=${UPLOAD_PROFILE_DIR}`,
      `--remote-debugging-port=${cdpPort}`,
      ...CLEAN_CHROME_ARGS,
      folderUrl,
    ]);

  startUploadChrome();
  let browser: Browser | undefined;
  try {
    await waitForCdpReady(cdpPort);
    let landedOnSharePoint = await waitForCdpAwayFromLogin(cdpPort);
    if (!landedOnSharePoint) {
      console.log(
        'SharePoint: login page appeared in the automated window. Closing it and opening a normal Chrome window instead…'
      );
      await stopChromeUsingProfile(UPLOAD_PROFILE_DIR);
      await ensureInteractiveSharePointLogin(folderUrl);
      startUploadChrome();
      await waitForCdpReady(cdpPort);
      landedOnSharePoint = await waitForCdpAwayFromLogin(cdpPort, 20_000);
      if (!landedOnSharePoint) {
        throw new Error(
          'SharePoint opened a sign-in page again after the saved session. Complete sign-in in the normal Chrome window, then rerun the test.'
        );
      }
    }

    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const context = browser.contexts()[0];
    const page = context.pages().find((p) => !LOGIN_URL_PATTERN.test(p.url())) || context.pages()[0];

    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(2000);

    // A valid session can still show a brief silent-SSO redirect
    // (sso_reload=true) through login.microsoftonline.com before landing on
    // the actual folder — give that a moment to finish settling.
    const redirectStart = Date.now();
    while (LOGIN_URL_PATTERN.test(page.url()) && Date.now() - redirectStart < 20_000) {
      await sleep(500);
    }
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(1000);

    console.log(`SharePoint: landed on ${page.url()}`);

    // Sharing links sometimes show an interstitial — click through if present
    const openLink = page.getByRole('link', { name: /open|go to folder|files/i }).first();
    if (await openLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await openLink.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await sleep(2000);
    }

    // Prefer SharePoint REST (reliable). Fall back to UI (+ Create or upload) if needed.
    // Never overwrite an existing file — if the name is taken, add a numeric suffix.
    let nameToUpload = remoteFileName;
    for (let attempt = 0; attempt < 8; attempt++) {
      nameToUpload = uniqueReportFileName(remoteFileName, attempt);
      const restOk = await uploadViaSharePointRest(context, page, absoluteFilePath, nameToUpload, subfolder);
      if (restOk === 'exists') {
        console.log(`SharePoint: keeping existing "${nameToUpload}" and trying a new name.`);
        continue;
      }
      if (restOk) {
        await page.reload({ waitUntil: 'load' }).catch(() => {});
        await sleep(2000);
        const visible = await page
          .getByText(nameToUpload, { exact: false })
          .first()
          .isVisible()
          .catch(() => false);
        if (visible) {
          console.log(`SharePoint: confirmed "${nameToUpload}" is in the folder.`);
          return;
        }
        console.log('SharePoint: REST upload returned OK; file may still be syncing into the view.');
        return;
      }
      break;
    }

    if (subfolder) {
      await openSourceSubfolder(page, subfolder);
    }
    await uploadViaSharePointUi(page, absoluteFilePath, nameToUpload);
  } finally {
    await browser?.close().catch(() => {});
    await stopChromeUsingProfile(UPLOAD_PROFILE_DIR);
  }
}

async function copyToSyncDir(absoluteFilePath: string, remoteFileName: string, syncDir: string) {
  fs.mkdirSync(syncDir, { recursive: true });
  let destName = remoteFileName;
  for (let attempt = 0; attempt < 8; attempt++) {
    destName = uniqueReportFileName(remoteFileName, attempt);
    const dest = path.join(syncDir, destName);
    if (fs.existsSync(dest)) {
      console.log(`SharePoint: "${destName}" already exists in the synced folder — not overwriting.`);
      continue;
    }
    fs.copyFileSync(absoluteFilePath, dest);
    console.log(`SharePoint: copied report to synced folder → ${dest}`);
    return dest;
  }
  throw new Error(`Could not copy "${remoteFileName}" into "${syncDir}" without overwriting an existing file.`);
}

/**
 * Save the Word report into the Copley, Rush, or NERM SharePoint folder.
 */
export async function uploadReportForSource(
  localFilePath: string,
  remoteFileName: string,
  sourceName: string
): Promise<string | undefined> {
  const dest = sharePointDestinationForSource(sourceName);
  const label = dest.subfolder ? `${dest.subfolder} folder` : 'team folder';
  console.log(`SharePoint: ${sourceName} → Playwright test cases / ${label}`);
  return uploadFileToSharePointFolder(
    localFilePath,
    remoteFileName,
    dest.folderUrl,
    dest.syncDir ? path.join(dest.syncDir, dest.subfolder || '') : undefined,
    dest.subfolder
  );
}

export async function uploadFileToSharePointFolder(
  localFilePath: string,
  remoteFileName: string,
  folderSharingUrl: string = process.env.SHAREPOINT_FOLDER_URL || DEFAULT_SHAREPOINT_FOLDER_URL,
  syncDirOverride?: string,
  subfolder?: string
): Promise<string | undefined> {
  if (/^(0|false|no|off)$/i.test(process.env.SHAREPOINT_UPLOAD || '')) {
    console.log('SharePoint upload skipped (SHAREPOINT_UPLOAD=false).');
    return undefined;
  }
  if (!fs.existsSync(localFilePath)) {
    throw new Error(`Cannot upload — file not found: ${localFilePath}`);
  }

  const absoluteFilePath = path.resolve(localFilePath);
  const syncDir = (syncDirOverride ?? process.env.SHAREPOINT_SYNC_DIR)?.trim();
  if (syncDir) {
    return copyToSyncDir(absoluteFilePath, remoteFileName, syncDir);
  }
  if (!folderSharingUrl) {
    console.log('SharePoint upload skipped: no SHAREPOINT_FOLDER_URL configured.');
    return undefined;
  }

  console.log(`SharePoint: saving "${remoteFileName}" to the team folder automatically…`);

  try {
    await uploadAutomatically(folderSharingUrl, absoluteFilePath, remoteFileName, subfolder);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SharePoint automatic upload failed: ${message}`);
  }

  console.log(`SharePoint: saved successfully — "${remoteFileName}"`);
  return folderSharingUrl;
}

/** Delete the local staging copy after a successful SharePoint publish. */
export function removeLocalReportCopy(localFilePath: string) {
  try {
    if (fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
      console.log(`Local staging copy removed (report lives in SharePoint only): ${localFilePath}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`Could not remove local staging copy (${message}): ${localFilePath}`);
  }
}
