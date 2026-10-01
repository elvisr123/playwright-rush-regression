/**
 * Selectors captured via Playwright Codegen (password / login URL stripped).
 * Wired into emailNotification.ts — keep this as reference only.
 */
import { test } from '@playwright/test';

test.use({
  viewport: {
    height: 900,
    width: 1400,
  },
});

test('outlook search reference — do not run (credentials stripped)', async ({ page }) => {
  await page.goto('https://outlook.cloud.microsoft/mail/');
  // Complete MFA / sign-in manually if session expired (never hardcode passwords).
  await page.getByRole('combobox', { name: 'Search for email, meetings,' }).click();
  await page.getByRole('combobox', { name: 'Search for email, meetings,' }).fill('<search text>');
  await page.getByRole('combobox', { name: 'Search for email, meetings,' }).press('Enter');
  await page
    .getByLabel(/No Reply Test SailPoint/i)
    .getByText('No Reply Test SailPoint')
    .click();
});
