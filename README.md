This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Working on ToyLogix

- `npm run dev` starts the local app; Supabase settings come from `.env.local`.
- `npm run lint` checks the application source.
- `npm run typecheck` checks TypeScript without building.
- `npm test` runs catalog/account regression tests and stock validation, migration, permissions, reversal, archive and transaction tests in a disposable PGlite PostgreSQL database. The test runner uses Node's native TypeScript support (Node 22.6 or newer).
- `npm run test:concurrency` starts a disposable local PostgreSQL cluster and tests competing withdrawals, receipts, reversals and archiving using separate connections. It never connects to Supabase. The `embedded-postgres` development dependency supplies native binaries; its installation scripts must be enabled. Run as a normal user (PostgreSQL refuses root).
- `npm run build` checks TypeScript and builds all routes.

Catalog rules live in `lib/catalog.ts`; the store's image, product-detail and favorites views live next to `Storefront.tsx`. Store session subscriptions and favorite persistence have dedicated hooks. Admin draft defaults and types live in `app/admin/models.ts`, and its inventory table is a separate view. Shared modal cleanup lives in `lib/dialog.ts`; registration validation and error messages live in `lib/auth-validation.ts`.

Keep Supabase authorization, approval checks, request cancellation, camera cleanup, and storage error handling in place when changing these modules. They protect existing user flows. Styling is kept in the existing CSS modules.

## Stock management

See [STOCK-MANAGEMENT.md](./STOCK-MANAGEMENT.md) for the initial audit, per-requirement implementation report, migration instructions, test coverage and operational rules.

The stock migration is `supabase/migrations/202609230001_stock_management.sql`, applied **after** the account-security migration. Apply it to the intended database before running the updated UI. Existing `produse.stoc_actual` balances are preserved as `opening_stock`; no historical operators or reasons are invented. New products start at zero. All subsequent stock changes use the `record_stock_movement` RPC with a mandatory reason, and negative stock is prohibited. Archive products instead of deleting them. No GitHub push or Netlify deployment is part of this change.

## Account security

See [SECURITY-MANAGEMENT.md](./SECURITY-MANAGEMENT.md) for the eight-part implementation report, access matrix, account deletion rules, tests and remaining live checks. [AUTH-SETUP.md](./AUTH-SETUP.md) records the earlier rollout.

The new `20260923210656_account_hardening.sql` migration follows both migrations above. It adds current-session/MFA authorization, account isolation, immutable audit logs, explicit account lifecycle operations, hashed one-use recovery codes and persistent rate counters. Admins enter `/account/security` for TOTP setup/verification before `/admin`.

Copy the server configuration names from [.env.example](./.env.example); never put the service role key into public client variables. Login/signup/reset now use server endpoints and fail closed if configuration or the rate-limit database is unavailable. The migration and UI require a coordinated rollout; neither has been published. The concurrency suite also checks recovery-code races, shared rate counters and immediate role revocation.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
