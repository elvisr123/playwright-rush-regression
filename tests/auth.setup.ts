import { test as setup } from '@playwright/test';
import * as fs from 'fs';

const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  setup.setTimeout(180_000);

  // Skip login if a session file already exists and is less than 1 hour old
  if (fs.existsSync(authFile)) {
    const stats = fs.statSync(authFile);
    const ageMinutes = (Date.now() - stats.mtimeMs) / 1000 / 60;

    if (ageMinutes < 60) {
      console.log(`Reusing existing session (${Math.round(ageMinutes)} min old) — skipping login.`);
      return;
    }
  }

  const username = process.env.ISC_USERNAME?.trim();
  const password = process.env.ISC_PASSWORD?.trim();

  if (!username || !password) {
    throw new Error('ISC_USERNAME and ISC_PASSWORD must be set in the .env file before running this test.');
  }

  fs.mkdirSync('playwright/.auth', { recursive: true });

  await page.goto('https://rush-sb.identitynow.com/login/login/?prompt=true&brand=default', {
    waitUntil: 'domcontentloaded',
  });

  // RUSH login form uses id=username / id=password (empty name attributes).
  const usernameField = page.locator('#username, input[name="username"], input[type="email"], input[autocomplete="username"]').first();
  await usernameField.waitFor({ state: 'visible', timeout: 30000 });
  await usernameField.fill(username);

  const passwordField = page.locator('#password, input[type="password"], input[name="password"]').first();
  await passwordField.waitFor({ state: 'visible', timeout: 15000 });
  await passwordField.fill(password);

  const submitButton = page.getByRole('button', { name: /sign in/i });
  await submitButton.click();

  // After Sign In, Okta SSO / MFA may appear — wait for IdentityNow app shell.
  try {
    await page.waitForURL(
      (url) =>
        url.hostname.includes('identitynow.com') &&
        !url.pathname.includes('/login/') &&
        !url.pathname.includes('/sso/saml'),
      { timeout: 120_000 },
    );
  } catch (err) {
    // An MFA challenge needs a human — nobody can approve a push or type a
    // code in a headless browser, so the wait above just burns its full
    // 120s and reports a bare navigation timeout that says nothing about
    // the actual cause. Hit this for real (2026-11-06) on a batch:document
    // run: the session file had aged past the 60-minute reuse window, the
    // re-login landed on /login/default/mfa/verify, and all 8 specs were
    // skipped behind the failed setup.
    const url = page.url();
    if (/\/mfa\/|\/verify|challenge/i.test(url)) {
      throw new Error(
        `Login stopped at an MFA challenge and timed out — nobody can approve it in a headless browser.\n` +
          `  Current URL: ${url}\n\n` +
          `Run the login once with a visible browser, approve the prompt, then re-run what you were doing:\n` +
          `  npx playwright test tests/auth.setup.ts --project=setup --headed\n\n` +
          `The session is saved to ${authFile} and reused for 60 minutes, so this is a one-time step per hour.`
      );
    }
    throw err;
  }

  await page.context().storageState({ path: authFile });
  console.log(`Saved session to ${authFile}`);
});