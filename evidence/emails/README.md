# Provisioning email screenshots (automated)

The identity is set in `tests/config/identities.local.json` (`emailNotification`, gitignored — copy `identities.example.json`). The test opens Outlook on a search URL. It does **not** type or click in the inbox (Outlook treats E as Archive).

```powershell
npx playwright test tests/sources/email-notification.spec.ts --headed --project=outlook
```

If a login or MFA page appears, finish it in that same window. Do not type in Outlook.

Screenshot files:

```
evidence/emails/<stageKey>_manager.png
temp/<stageKey>_6_Email_manager.png
```
