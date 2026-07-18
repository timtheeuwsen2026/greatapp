# Production Email Delivery

The application renders its email HTML in `server/emailTemplates.ts` and sends it through the configured provider. No provider-hosted dynamic template is required.

## Required configuration

- `RESEND_API_KEY`: production Resend API key.
- `RESEND_FROM_EMAIL`: verified sender address.
- `RESEND_FROM_NAME`: sender display name, normally `Great. Experiences`.
- `VITE_APP_BASE_URL`: canonical HTTPS application URL, for example `https://app.yourdomain.com`. `APP_BASE_URL` remains a legacy alias.
- `EMAIL_PREFERENCES_SECRET`: recommended random secret of at least 32 characters. If omitted, the server reuses `SESSION_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, or the required `RESEND_API_KEY`, in that order. Changing the selected secret invalidates existing preference links.

Production startup fails immediately when required email configuration is missing or still contains placeholder domains.
It also rejects HTTP and localhost application URLs, so production email cannot silently contain a development destination.
Production deployments should configure these values in the hosting provider's environment-variable settings. A physical `.env` file is not expected inside the container.

`npm start` automatically applies the narrowly scoped, idempotent email-delivery migration before starting Express. The migration uses a PostgreSQL advisory lock so concurrent container starts cannot race while creating the email tables and indexes. It does not run a broad schema push or modify unrelated application tables.

In Supabase Authentication URL Configuration, set the Site URL to the same `VITE_APP_BASE_URL` and allow these redirect URLs:

- `${VITE_APP_BASE_URL}/login?verified=1`
- `${VITE_APP_BASE_URL}/reset-password`

The application also overwrites the `redirect_to` parameter in every generated verification and recovery action link as a defense in depth measure.

## Database migration

Apply `migrations/20260718_production_email_delivery.sql` before deploying the application. It creates:

- `email_preferences` for recipient-level optional-email controls.
- `email_notification_events` for durable deduplication, delayed delivery, retries, and scheduler recovery.

## Delivery behavior

- Account, security, booking, deal, finance, and payout email is transactional and cannot be disabled.
- Community activity, reminders, open-role alerts, and external invitations respect recipient preferences.
- Booking and MVG email uses database-backed idempotency.
- Reminder, open-role, and delayed community email uses durable event keys so restarts and multiple server instances do not duplicate delivery.
- Failed delayed jobs retry with exponential backoff and stop after five attempts.

## Verification

Run:

```bash
npm run test:email
npm run check
npm run build
```
