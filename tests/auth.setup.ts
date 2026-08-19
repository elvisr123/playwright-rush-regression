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
  await page.waitForURL(
    (url) =>
      url.hostname.includes('identitynow.com') &&
      !url.pathname.includes('/login/') &&
      !url.pathname.includes('/sso/saml'),
    { timeout: 120_000 },
  );

  await page.context().storageState({ path: authFile });
  console.log(`Saved session to ${authFile}`);
});