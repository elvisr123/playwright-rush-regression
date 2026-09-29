import { test as setup } from '@playwright/test';
import { signInToOutlook } from './helpers/emailNotification';

// Optional one-time Outlook sign-in. The email spec also signs in by itself.
//   npx playwright test tests/outlook-login.setup.ts --headed --project=outlook-setup
setup('sign in to Outlook once', async () => {
  setup.setTimeout(360_000);
  await signInToOutlook();
  console.log('Outlook session is saved in playwright/.auth/chrome-outlook');
});
