# Supabase Auth rollout

## Account deletion hotfix — 2026-09-24

Before the full hardening rollout, authenticated account deletion uses the
`delete-account` Supabase Edge Function. Deploy `supabase/functions/delete-account`
with JWT verification enabled and apply the standalone
`20260924113302_account_delete_cascade.sql` migration before publishing the client.
The Edge Function uses Supabase-provided server credentials; Netlify needs only
the existing public Supabase URL/key for this path. No service key is sent to the
browser. Full hardening still requires all server variables described below.

The function verifies the Auth user and database admin role, blocks self-deletion,
and rechecks the role before deleting. Preparation/MFA/history errors never fall
back to the legacy path. Legacy handling requires both a specifically missing
preparation RPC and confirmation that `is_active` is absent. Auth deletion removes
its profile and billing atomically; existing retention foreign keys can block the
whole deletion. Unlinked legacy profiles are deleted through the caller's RLS.
When hardening is enabled, the client continues using the existing Next endpoint.

This standalone migration can be applied without the stock/hardening migrations.
It only changes the profile's Auth foreign key to cascade; it deletes no users.

## Login hotfix — 2026-09-24

The hosted database still uses the September 19 schema (no `is_active` or
`consume_auth_rate_limit`). Until the coordinated hardening rollout is complete,
leave `NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED` unset or `false`. Login, signup and
reset use Supabase Auth with its provider limits; existing RLS and approval checks
remain in force. Admin routing checks the actual database authorization RPC.
The new application-level persistent limiter is only active in hardening mode.

After applying the migrations and configuring all server variables, set
`NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED=true` and rebuild. The build rejects
hardening mode without its server configuration; never enable it before migration.

## Local hardening revision (2026-09-23, not published)

The current working revision additionally requires
`supabase/migrations/202609230001_stock_management.sql`, then
`supabase/migrations/20260923210656_account_hardening.sql`, the server-only
variables in `.env.example`, and the updated MFA UI in one coordinated rollout.
See [SECURITY-MANAGEMENT.md](./SECURITY-MANAGEMENT.md) for the authoritative
current access matrix, deletion/FK behavior, rate limits and eight-item report.
Login/signup/reset now pass through Next server endpoints before Supabase Auth.
The hosted verification below describes the earlier September 19 migration only.
The new migrations have **not** been applied to the hosted project; no Netlify or
GitHub publication was performed. One real reset email was received by the
authorized test recipient; no password/factor changes or signup email delivery
tests were performed.

## Earlier setup and rollout

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
