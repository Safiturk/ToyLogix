# Account security

Database row-level security is the authorization boundary. Browser state and hidden controls do not grant access.

## Access

Pending customers can complete their own profile and billing details. Approved customers can enter the catalog. Rejected, disabled, and deleted profiles cannot use the application. In hardening mode, administrators must verify TOTP before accessing management features.

Hardening checks current profile permissions, Auth session state, and administrator MFA. Recovery codes are hashed and single-use. Successful recovery revokes sessions and requires a new login and TOTP enrollment.

## Account lifecycle

- Disabling access preserves Auth, billing, and history. Re-enabling does not change approval or role.
- Deleting a profile blocks application access and prevents automatic profile recreation, but retains Auth and billing records.
- Deleting an account checks administrator authorization, disables the target, records the request, and calls the Supabase Admin API. Profile and billing foreign keys cascade; retained stock or invoice history can prevent deletion. If the provider call fails, access remains disabled and the UI reports the failure.

Audit identifiers remain available after account deletion. Administrators cannot delete themselves through the management endpoint.

## Server controls

Hardening routes validate the request origin and use persistent rate counters with HMAC-derived identifiers. Netlify's client-IP header is trusted only when the hosting-provided `NETLIFY=true` flag is set. Other hosts use a shared server bucket until a trusted proxy adapter is configured. Application rate limits supplement Supabase Auth's provider limits.

Server secrets are validated separately from public configuration. Public variables reject service-role keys. Responses apply a nonce-based content security policy, framing restrictions, and production HSTS.

See [setup](setup.md) for the coordinated rollout. The unit and database suites cover permission boundaries, account isolation, recovery-code consumption, and revocation; staging checks are still needed for real email delivery and provider MFA flows.

## Dependency maintenance

ExcelJS uses a scoped override to `uuid@11.1.1`, which patches GHSA-w5hq-g745-h8pq while retaining the CommonJS interface ExcelJS requires. Export and conditional-formatting tests cover compatibility. Revisit the override when ExcelJS updates its dependency.
