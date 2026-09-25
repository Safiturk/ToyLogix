# ToyLogix

ToyLogix is a B2B toy catalog and inventory application with customer approval, stock tracking, and PDF order requests.

## Stack

Next.js 16 App Router, React 19, TypeScript, Supabase Auth/PostgreSQL/Storage, and Tailwind CSS 4 with CSS modules. ExcelJS handles inventory exports; jsPDF generates order requests.

## Setup

Use Node.js 22.6 or newer and npm.

```sh
npm install
cp .env.example .env.local
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`.
Fill in the Supabase project URL and public key in `.env.local`, then start the app:

```sh
npm run dev
```

Open [localhost:3000](http://localhost:3000).

The migrations extend an existing ToyLogix database; they do not provision an empty project. The original production baseline is not included. See [database and authentication setup](docs/setup.md) for prerequisites, migration order, and optional server settings. Test fixtures are not a production database seed.

## Features and structure

- `app/store`: searchable catalog, favorites, cart, and PDF order requests. Requests do not process payments or reserve stock.
- `app/admin`: customer approval, inventory, barcode scanning, stock history, and Excel exports.
- `app/account` and `app/api`: account details, authentication, and administrator MFA.
- `lib`: shared validation, data access, and business rules.
- `supabase`: database migrations, authorization tests, and the account-deletion Edge Function.
- `netlify/functions`: scheduled registration notifications through Resend.
- `tests`: unit tests and isolated database/integration tests.

See [security](docs/security.md), [stock management](docs/stock-management.md), and [order requests](docs/order-requests.md) for operational details.

## Checks

```sh
npm run typecheck
npm run lint
npm test
npm run test:concurrency
npm run build
npm start
```

The concurrency suite starts a temporary PostgreSQL instance and requires the bundled native binaries. Run it as a normal user, not root. Database tests use local fixtures and do not connect to Supabase. Production builds require the same environment configuration as the app.

## License

No license has been granted for the application source. The bundled Noto Sans font is distributed under the [SIL Open Font License](public/fonts/OFL.txt).
