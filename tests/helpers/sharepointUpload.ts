import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { chromium, BrowserContext, Frame, Page } from '@playwright/test';

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
const LOGIN_MARKER = path.join(UPLOAD_PROFILE_DIR, '.login-ok');

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
  throw new Error('Google Chrome was not found.');
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function isUploadChromeRunning(): boolean {
  return [path.join(UPLOAD_PROFILE_DIR, 'SingletonLock'), path.join(UPLOAD_PROFILE_DIR, 'lockfile')].some((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

async function waitForUploadChromeClosed(timeoutMs = 300_000) {
  const continueFile = path.join(UPLOAD_PROFILE_DIR, 'CONTINUE');
  if (fs.existsSync(continueFile)) fs.unlinkSync(continueFile);

  const start = Date.now();
  let sawRunning = isUploadChromeRunning();

  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(continueFile)) {
      fs.unlinkSync(continueFile);
      console.log('SharePoint: CONTINUE file detected — proceeding.');
      return;
    }
    const running = isUploadChromeRunning();
    if (running) sawRunning = true;
    if (sawRunning && !running) {
      await sleep(1500);
      if (!isUploadChromeRunning()) return;
    }
    await sleep(1000);
  }

  throw new Error(
    'Timed out waiting for the SharePoint sign-in Chrome window to close.\n' +
      `Close it, or create an empty file named CONTINUE in:\n  ${UPLOAD_PROFILE_DIR}`
  );
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
async function uploadAutomatically(
  folderUrl: string,
  absoluteFilePath: string,
  remoteFileName: string,
  subfolder?: string
): Promise<void> {
  if (isUploadChromeRunning()) {
    throw new Error(
      'A SharePoint upload Chrome window is still open. Close it, then re-run so upload can run automatically.'
    );
  }

  console.log('SharePoint: uploading automatically (no manual steps)…');

  const context: BrowserContext = await chromium.launchPersistentContext(UPLOAD_PROFILE_DIR, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1400, height: 900 },
    ignoreDefaultArgs: ['--enable-automation'],
    args: ['--disable-blink-features=AutomationControlled'],
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(folderUrl, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await sleep(3000);

    console.log(`SharePoint: landed on ${page.url()}`);

    if (/login\.(microsoftonline|live)\.com|sso\.godaddy\.com/i.test(page.url())) {
      throw new Error('SHAREPOINT_LOGIN_REQUIRED');
    }

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
    await context.close().catch(() => {});
  }
}

/**
 * One-time sign-in only (GoDaddy blocks automated login).
 * After you close the window, the test uploads the file automatically.
 */
async function ensureSignedIn(folderUrl: string) {
  fs.mkdirSync(UPLOAD_PROFILE_DIR, { recursive: true });
  const chromePath = findChromePath();

  console.log('\n========== ONE-TIME SHAREPOINT SIGN-IN ==========');
  console.log('1) Sign in with your work account in the Chrome window');
  console.log('2) Confirm you can see the SharePoint folder');
  console.log('3) CLOSE that Chrome window');
  console.log('   → The test then uploads the Word file automatically');
  console.log('=================================================\n');

  spawn(
    chromePath,
    [`--user-data-dir=${UPLOAD_PROFILE_DIR}`, '--new-window', '--no-first-run', folderUrl],
    { detached: true, stdio: 'ignore' }
  ).unref();

  const start = Date.now();
  while (!isUploadChromeRunning() && Date.now() - start < 30_000) {
    await sleep(500);
  }

  await waitForUploadChromeClosed(300_000);
  fs.writeFileSync(LOGIN_MARKER, new Date().toISOString(), 'utf8');
  console.log('SharePoint: signed in. Starting automatic upload…');
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

  if (!fs.existsSync(LOGIN_MARKER)) {
    await ensureSignedIn(folderSharingUrl);
  }

  try {
    await uploadAutomatically(folderSharingUrl, absoluteFilePath, remoteFileName, subfolder);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message.includes('SHAREPOINT_LOGIN_REQUIRED')) {
      throw new Error(`SharePoint automatic upload failed: ${message}`);
    }

    console.log('SharePoint: session expired. Sign in once more; upload will still be automatic…');
    if (fs.existsSync(LOGIN_MARKER)) fs.unlinkSync(LOGIN_MARKER);
    await ensureSignedIn(folderSharingUrl);
    await uploadAutomatically(folderSharingUrl, absoluteFilePath, remoteFileName, subfolder);
  }

  fs.writeFileSync(LOGIN_MARKER, new Date().toISOString(), 'utf8');
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
