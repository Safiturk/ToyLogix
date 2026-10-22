# Account security

Database row-level security is the application's authorization boundary. Browser state and hidden controls do not grant access. Pending customers can complete their own profile and billing details, while approved customers can enter the catalog. Rejected, disabled, and deleted profiles cannot use the application. In hardening mode, administrators must verify TOTP before accessing management features.

Hardening checks current profile permissions, Auth session state, and administrator MFA. Recovery codes are hashed and single-use. Successful recovery revokes sessions and requires a new login and TOTP enrollment.

The account lifecycle distinguishes between disabling access, deleting a profile, and deleting an account. Disabling access preserves Auth, billing, and history; re-enabling it does not change approval or role. Deleting a profile blocks application access and prevents automatic profile recreation, while retaining Auth and billing records.

Account deletion checks administrator authorization, disables the target, records the request, and calls the Supabase Admin API. Profile and billing foreign keys cascade, although retained stock or invoice history can prevent deletion. If the provider call fails, access remains disabled and the UI reports the failure. Audit identifiers remain available after account deletion, and administrators cannot delete themselves through the management endpoint.

Hardening routes validate the request origin and use persistent rate counters with HMAC-derived identifiers. Netlify's client-IP header is trusted only when the hosting-provided `NETLIFY=true` flag is set. Other hosts use a shared server bucket until a trusted proxy adapter is configured. Application rate limits supplement Supabase Auth's provider limits.

Server secrets are validated separately from public configuration, and public variables reject service-role keys. Responses apply a nonce-based content security policy, framing restrictions, and production HSTS. The coordinated rollout is described in the [setup documentation](setup.md). Unit and database suites cover permission boundaries, account isolation, recovery-code consumption, and revocation, while staging checks are still needed for real email delivery and provider MFA flows.

ExcelJS uses a scoped override to `uuid@11.1.1`, which patches GHSA-w5hq-g745-h8pq while retaining the CommonJS interface ExcelJS requires. Export and conditional-formatting tests cover compatibility. The override needs to be revisited when ExcelJS updates its dependency.
