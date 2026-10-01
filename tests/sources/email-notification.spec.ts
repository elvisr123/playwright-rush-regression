import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { captureOutlookProvisioningEmail, emailEvidenceFileName } from '../helpers/emailNotification';
import { LOCAL_IDENTITIES } from '../config/localIdentities';

// Email screenshot automation — search the identity's search text, open provisioning mail.
// Identity comes from tests/config/identities.local.json (emailNotification).
//
//   npx playwright test tests/sources/email-notification.spec.ts --headed --project=outlook
//
// Stay in the Chrome window if MFA appears.
// Uses Outlook combobox "Search for email, meetings,…" (NOT the browser address bar).
//
// Screenshot is saved to:
//   evidence/emails/<stageKey>_manager.png
//   temp/<stageKey>_6_Email_manager.png
const IDENTITY = LOCAL_IDENTITIES.emailNotification;
const STAGE_KEY = IDENTITY?.stageKey ?? '';
const IDENTITY_NAME = IDENTITY?.name ?? '';
const SEARCH_TEXT = IDENTITY?.searchText ?? IDENTITY_NAME;

test('Provisioning email — manager', async () => {
  test.skip(!STAGE_KEY || !IDENTITY_NAME, 'Set emailNotification in tests/config/identities.local.json');
  test.setTimeout(420_000);
  const destPath = `temp/${STAGE_KEY}_6_Email_manager.png`;
  const captured = await captureOutlookProvisioningEmail({
    identityName: IDENTITY_NAME,
    audience: 'manager',
    destPath,
    searchText: SEARCH_TEXT,
  });
  if (!captured || !fs.existsSync(destPath)) {
    throw new Error(
      `Outlook did not capture a screenshot for ${SEARCH_TEXT}. Finish MFA if prompted, confirm the email exists, then re-run.`
    );
  }
  const kept = path.join('evidence', 'emails', emailEvidenceFileName(STAGE_KEY, 'manager'));
  fs.mkdirSync(path.dirname(kept), { recursive: true });
  fs.copyFileSync(destPath, kept);
  console.log(`Screenshot saved: ${captured}`);
  console.log(`Also copied to: ${kept}`);
});
