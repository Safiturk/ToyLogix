# Database and authentication setup

The database setup uses an existing ToyLogix Supabase database containing the legacy `public.utilizatori` and `public.produse` tables. Their original production DDL is not included in the repository. The schemas in `tests/fixtures` are isolated test schemas rather than a deployable baseline.

Preparation involves backing up the target database, reconciling duplicate profile emails, and confirming that an approved administrator maps to a confirmed Supabase Auth user. The account-security migration aborts if no verified administrator exists. Since legacy password hashes are not Supabase Auth credentials, those accounts require migration through a trusted invitation or password-reset process.

The files in `supabase/migrations` are applied in filename order. The stock and account-hardening migrations need to be coordinated with the application release because old clients cannot write stock directly after the stock migration, while hardening requires administrator MFA.

Local environment configuration starts with a copy of `.env.example` saved as `.env.local`. `NEXT_PUBLIC_SUPABASE_URL` contains the project HTTPS URL, and `NEXT_PUBLIC_SUPABASE_ANON_KEY` contains a publishable key or legacy anon key, never a secret/service-role key. `NEXT_PUBLIC_ACCOUNT_HARDENING_ENABLED` remains blank or `false` for the legacy authentication path. It is set to `true` only once the hardening migration and server configuration are ready, followed by a rebuild.

Hardening also requires the server-only `SUPABASE_SERVICE_ROLE_KEY`, a random `AUTH_RATE_LIMIT_SECRET` of at least 32 characters, and an `AUTH_SITE_URL` matching the exact browser origin. Local development can use `http://localhost:3000` as its origin.

Registration notifications are optional and depend on `RESEND_API_KEY`, `NOTIFICATION_FROM`, and `NOTIFICATION_TO` being configured together with a verified sender domain. When notifications are unused, all three remain blank. The Netlify function reads these server settings. Supabase supplies the Edge Function's `SUPABASE_URL`, public key, and server credentials in its own runtime. `NETLIFY` is a hosting-provided flag and is not required locally.

Authentication configuration includes enabling the Supabase email provider and configuring email delivery. The Site URL and the exact `/login`, `/email-confirmed`, and `/update-password` redirect URLs are configured for each supported origin. Email templates retain `{{ .ConfirmationURL }}`.

In legacy mode, account deletion uses `supabase/functions/delete-account`, deployed with JWT verification enabled. This flow depends on `20260924113302_account_delete_cascade.sql` being applied first. In hardening mode, deletion uses the Next.js server endpoint.

Deployment verification covers registration, confirmation, customer approval, login, password recovery, administrator MFA, and access revocation using staging accounts. Publishing the source repository does not apply database migrations or deploy the application.
