# Supabase Auth rollout

Login now uses Supabase Auth `signInWithPassword`. Recovery uses
`resetPasswordForEmail` and `updateUser`; legacy `utilizatori.parola` values are
not valid Supabase Auth credentials and are deliberately not a login fallback.

Before deploying:

1. Enable the Supabase email provider and configure production email delivery.
2. Set the production Site URL. Allow exact `/login` and `/update-password`
   redirect URLs for production and local development in Authentication > URL
   Configuration. Keep the default recovery email confirmation URL so Supabase
   validates the token and redirects with a recovery session.
   Also allow `/email-confirmed` on every registration origin (toylogix.eu,
   www.toylogix.eu if used, toylogix.netlify.app, and localhost for development).
   Signup emails now request that destination to display a confirmation result.
   Email confirmation templates should retain `{{ .ConfirmationURL }}`.
   Previously sent emails keep their original redirect destinations.
3. Migrate existing `utilizatori` accounts into Supabase Auth using a trusted
   server-side admin process (invite by verified email, then set a new password).
   Never copy SHA-256 hashes as plaintext passwords or expose service-role keys
   in the browser. Existing approved/role profile values must be preserved.
4. Test new registration, email confirmation, admin approval, login, reset email,
   fresh reset link, expired/reused link, and login with the new password. Verify
   that the old password is rejected and pending/rejected profiles cannot enter.
5. Apply `supabase/migrations/202609190001_account_security.sql` BEFORE publishing
   this revision. First take a database backup and review existing policies and
   triggers. This migration replaces policies on `utilizatori`, `produse`, and
   `billing_profiles`. Existing roles/statuses remain unchanged: audit old admin
   rows and ensure the owner's confirmed Auth account maps to an approved admin.
   Duplicate legacy emails cause the transaction to abort rather than guess.
6. New signup profiles are now created atomically by the Auth trigger, always as
   pending/user. Do not keep a separate existing profile-creation trigger without
   reviewing it for duplicate insert conflicts. Legacy profiles are linked only
   after confirmed email ownership; missing confirmed users get pending profiles.

The admin route now checks the verified Auth user and persisted role before
mounting the dashboard. `/admin-login` redirects to the ordinary login. Cached
localStorage information is for display only, not database authorization.
RLS is the security boundary and applies on EVERY database request, including
after revocation while an old admin page is still open. The UI rechecks on focus
and every 30 seconds. This change does not audit unrelated database tables or RPCs.

## Required live/staging access checks after SQL is applied

- Anonymous session: cannot read customer/billing/product data or write products.
- Customer A: direct `/admin` visit redirects away, even with forged
  `admin_authenticated=true` and an admin-looking `user_session` in localStorage.
- Customer A: can read/update only their own contact/billing data; a direct API
  update of their role/status fails; requests targeting customer B fail.
- New signup with `rol=admin` in user metadata still creates pending/user profile.
- Approved admin: can read customer A/B details and explicitly grant/revoke roles.
- Revoked admin: writes fail immediately at RLS, and UI redirects at next check.
- Pending profile: can sign in to `/account` to complete its own information;
  catalog access still requires admin approval. Rejected profiles cannot sign in.
- Save own profile: contact and billing changes commit together or both roll back.
- Existing owner account: still approved/admin with matching `auth_user_id`.

Do not publish to another database without the migration: the client requires
`auth_user_id`, `billing_profiles`, and `save_my_account`.

## Hosted verification — 2026-09-19

The production schema was inspected through the authenticated Supabase SQL Editor.
The two existing public tables had RLS disabled, broad anon/authenticated grants,
and no policies, custom functions, views, or profile triggers. The owner confirmed
the sole existing approved administrator; its confirmed Auth linkage is preserved.

The migration passed a transaction rolled back before deployment, then was applied
successfully. The regression script `supabase/tests/account_security.sql` passed
both in the dry run and against the applied schema. It verifies signup metadata
cannot grant admin, customer isolation, own billing save and rollback atomicity,
blocked self-approval/escalation, admin customer/billing access, role grant and
revocation, blocked anonymous reads, hidden legacy password columns, and removal
of TRUNCATE privileges (which are not governed by RLS).

All test users/data changes were rolled back; sequence numbers may have gaps.
No real confirmation/reset emails were sent by these SQL tests, and no SMTP or
email-verification settings were changed. Real sign-in/email delivery and complete
authenticated browser interactions remain separate end-to-end checks.

Existing profile deletion is not Auth-user deletion. The legacy password column
is retained only for schema compatibility and is inaccessible to API clients.
