# Database and authentication setup

## Prerequisites

Use an existing ToyLogix Supabase database with the legacy `public.utilizatori` and `public.produse` tables. Their original production DDL is not included. `tests/fixtures` contains isolated test schemas, not a deployable baseline.

Before applying migrations, back up the target database, reconcile duplicate profile emails, and confirm that an approved administrator maps to a confirmed Supabase Auth user. The account-security migration aborts if no verified administrator exists. Legacy password hashes are not Supabase Auth credentials; migrate those accounts through a trusted invitation or password-reset process.

Apply the files in `supabase/migrations` in filename order. Coordinate the stock and account-hardening migrations with the application release: old clients cannot write stock directly after the stock migration, and hardening requires administrator MFA.

## Environment

Copy `.env.example` to `.env.local`. Set:

- `NEXT_PUBLIC_SUPABASE_URL`: the project HTTPS URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: a publishable key or legacy anon key, never a secret/service-role key.
- `NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED`: leave blank or set `false` for the legacy authentication path. Set `true` only after the hardening migration and server configuration are ready, then rebuild.

Hardening also requires server-only `SUPABASE_SERVICE_ROLE_KEY`, a random `AUTH_RATE_LIMIT_SECRET` of at least 32 characters, and `AUTH_SITE_URL` matching the exact browser origin. Local development can use `http://localhost:3000` as its origin.

Registration notifications are optional. Configure `RESEND_API_KEY`, `NOTIFICATION_FROM`, and `NOTIFICATION_TO` together, with a verified sender domain. Otherwise leave all three blank. The Netlify function uses these server settings.

Supabase supplies the Edge Function's `SUPABASE_URL`, public key, and server credentials in its own runtime. `NETLIFY` is a hosting-provided flag; it is not required locally.

## Auth configuration

Enable the Supabase email provider and configure email delivery. Set the Site URL and allow exact `/login`, `/email-confirmed`, and `/update-password` redirect URLs for each supported origin. Email templates should retain `{{ .ConfirmationURL }}`.

In legacy mode, account deletion uses `supabase/functions/delete-account`. Deploy it with JWT verification enabled and apply `20260924113302_account_delete_cascade.sql` before using that flow. In hardening mode, deletion uses the Next.js server endpoint.

After deployment, verify registration, confirmation, customer approval, login, password recovery, administrator MFA, and access revocation against staging accounts. Publishing the source repository does not apply database migrations or deploy the application.
