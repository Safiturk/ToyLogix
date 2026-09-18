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
3. Migrate existing `utilizatori` accounts into Supabase Auth using a trusted
   server-side admin process (invite by verified email, then set a new password).
   Never copy SHA-256 hashes as plaintext passwords or expose service-role keys
   in the browser. Existing approved/role profile values must be preserved.
4. Test new registration, email confirmation, admin approval, login, reset email,
   fresh reset link, expired/reused link, and login with the new password. Verify
   that the old password is rejected and pending/rejected profiles cannot enter.
5. Configure `utilizatori` RLS for authenticated users to read only their own
   profile; roles and approval status must be writable only by authorized admins.
   New registration currently inserts the B2B profile after Auth signup. With
   email confirmation enabled, this requires the existing signup insert policy
   or a reviewed server-side trigger that creates a pending/user profile from
   signup metadata. Do not trust role/status provided in user metadata.

Registration is currently two operations (Auth user plus B2B profile), not a
transaction. If the profile insert fails after signup, reconcile the missing
pending profile from the Auth user's metadata using a trusted admin process.
Do not grant broad anonymous write/read access to make registration succeed.

The existing app still has localStorage UI/session guards and a legacy
`/admin-login` route; these are not security boundaries. Enforce authorization
with Supabase RLS and retire the legacy admin login before production. This
change does not claim to migrate the application's entire authorization system.

No remote Auth settings, migrations, invitations or real reset emails were
performed as part of the local implementation.
