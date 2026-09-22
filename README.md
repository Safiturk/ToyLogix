This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Working on ToyLogix

- `npm run dev` starts the local app; Supabase settings come from `.env.local`.
- `npm run lint` checks the application source.
- `npm test` runs regression tests for catalog filters, Romanian text matching, favorites, registration validation, and modal cleanup. The test runner uses Node's native TypeScript support (Node 22.6 or newer).
- `npm run build` checks TypeScript and builds all routes.

Catalog rules live in `lib/catalog.ts`; the store's image, product-detail and favorites views live next to `Storefront.tsx`. Store session subscriptions and favorite persistence have dedicated hooks. Admin draft defaults and types live in `app/admin/models.ts`, and its inventory table is a separate view. Shared modal cleanup lives in `lib/dialog.ts`; registration validation and error messages live in `lib/auth-validation.ts`.

Keep Supabase authorization, approval checks, request cancellation, camera cleanup, and storage error handling in place when changing these modules. They protect existing user flows. Styling is kept in the existing CSS modules.

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
